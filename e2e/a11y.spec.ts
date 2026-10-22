import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

// Automated accessibility pass over the DOM screens. axe-core inspects markup, ARIA and CSS; it cannot see what
// Phaser draws inside the game canvas, so canvas content (foes, hazards, the field itself) is out of scope here.
// This is not a screen-reader (TalkBack) verification.

const sizes = [{ width: 390, height: 844 }, { width: 320, height: 568 }];
const BLOCKING = new Set(['serious', 'critical']);

// The game has sound; automated runs keep it off.
test.use({ launchOptions: { args: ['--mute-audio'] } });

// Known, listed, not fixed: each HUD weapon slot's visible text includes a live damage counter, so making its
// spoken name contain the visible text needs a decision about what a slot should announce (see the checkpoint).
const KNOWN = [{ id: 'label-content-name-mismatch', html: 'data-focus=' }];

async function scan(page: Page, testInfo: TestInfo, label: string, assertContrast = true): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations
    .filter(violation => BLOCKING.has(violation.impact ?? ''))
    .map(violation => ({ id: violation.id, impact: violation.impact, help: violation.help,
      targets: violation.nodes
        .filter(node => !KNOWN.some(known => known.id === violation.id && node.html.includes(known.html)))
        .map(node => node.target.join(' ')) }))
    .filter(violation => violation.targets.length > 0);
  await testInfo.attach(`axe-${label}`, {
    body: JSON.stringify({ blocking, all: results.violations.map(v => ({ id: v.id, impact: v.impact,
      nodes: v.nodes.map(node => ({ target: node.target.join(' '), html: node.html, summary: node.failureSummary })) })),
      // "incomplete" is what axe could not decide (mostly contrast over gradients or art); kept for manual review.
      incomplete: results.incomplete.map(v => ({ id: v.id, nodes: v.nodes.map(node => ({ target: node.target.join(' '),
        reason: node.any.concat(node.all, node.none).map(check => check.message).join(' ') })) })) }, null, 2),
    contentType: 'application/json',
  });
  expect(blocking, `${label}: serious/critical axe violations`).toEqual([]);
  const undecided = results.incomplete.filter(rule => rule.id === 'color-contrast')
    .flatMap(rule => rule.nodes.map(node => node.target.join(' ')));
  const low = await renderedContrast(page, undecided);
  await testInfo.attach(`contrast-${label}`, { body: JSON.stringify(low, null, 2), contentType: 'application/json' });
  if (assertContrast) expect(low.filter(item => item.ratio < item.needed), `${label}: rendered text contrast below WCAG AA`).toEqual([]);
}

// axe leaves contrast "incomplete" when text sits on a gradient, blurred backdrop or pseudo-element, which is most
// of this UI. For those nodes only, measure the rendered pixels: hide all text, screenshot, and compare the text
// colour with the background pixels under each text run. The 2nd-percentile (near-worst) background pixel is used so
// a stray anti-aliased border pixel cannot decide the result.
async function renderedContrast(page: Page, targets: string[]) {
  const runs = await page.evaluate(selectors => selectors.map(selector => {
    const node = document.querySelector<HTMLElement>(selector);
    if (!node || node.closest('[disabled], [aria-hidden="true"]')) return null;
    const style = getComputedStyle(node);
    const size = parseFloat(style.fontSize), weight = Number(style.fontWeight) || 400;
    const rects: { x: number; y: number; w: number; h: number }[] = [];
    for (const child of Array.from(node.childNodes)) {
      // Ornament glyphs (❧ ✦ ➜) are decorative, not text; axe also leaves them undecided for that reason.
      if (child.nodeType !== Node.TEXT_NODE || !/[\p{L}\p{N}]/u.test(child.textContent ?? '')) continue;
      const range = document.createRange(); range.selectNodeContents(child);
      for (const rect of Array.from(range.getClientRects())) {
        // Sample the glyph band (one font-size tall, centred in the line box), not the leading above and below it,
        // which can touch a neighbouring card's border.
        const band = Math.min(rect.height, size);
        const top = rect.top + (rect.height - band) / 2;
        const x = Math.max(0, rect.left + 1), y = Math.max(0, top);
        const w = Math.min(innerWidth, rect.right - 1) - x, h = Math.min(innerHeight, top + band) - y;
        if (w >= 1 && h >= 1) rects.push({ x, y, w, h });
      }
    }
    if (rects.length === 0) return null;
    return { selector, color: style.color, rects, large: size >= 24 || (size >= 18.66 && weight >= 700) };
  }).filter(run => run !== null), targets);
  if (runs.length === 0) return [];
  const hide = await page.addStyleTag({ content: '#ui *,#ui *::before,#ui *::after{color:transparent!important;'
    + '-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}' });
  const shot = (await page.screenshot()).toString('base64');
  await hide.evaluate(node => node.remove());
  return page.evaluate(async ({ runs, shot }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${shot}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
    const scale = bitmap.width / innerWidth;
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const luminance = (r: number, g: number, b: number) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    return runs.map(run => {
      const [r, g, b, a = 1] = run.color.match(/[\d.]+/g)!.map(Number);
      const ratios: number[] = [];
      for (const rect of run.rects) {
        for (let y = Math.floor(rect.y * scale); y < Math.floor((rect.y + rect.h) * scale); y++) {
          for (let x = Math.floor(rect.x * scale); x < Math.floor((rect.x + rect.w) * scale); x++) {
            const i = (y * bitmap.width + x) * 4;
            const [br, bg, bb] = [pixels[i], pixels[i + 1], pixels[i + 2]];
            const fg = luminance(r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a));
            const back = luminance(br, bg, bb);
            ratios.push((Math.max(fg, back) + 0.05) / (Math.min(fg, back) + 0.05));
          }
        }
      }
      ratios.sort((p, q) => p - q);
      const ratio = ratios[Math.floor(ratios.length * 0.02)];
      return { target: run.selector, color: run.color, ratio: Math.round(ratio * 100) / 100,
        min: Math.round(ratios[0] * 100) / 100, needed: run.large ? 3 : 4.5 };
    });
  }, { runs, shot });
}

async function sceneCall(page: Page, body: string): Promise<void> {
  await page.evaluate(async source => {
    const path = (document.querySelector('script[src*="/src/main.ts"]') as HTMLScriptElement).src;
    const { scene: s, game } = await import(path);
    new Function('s', 'game', source)(s, game);
  }, body);
}

const activeId = (page: Page) => page.evaluate(() => {
  const active = document.activeElement as HTMLElement | null;
  return active?.id || active?.getAttribute('data-route') || active?.getAttribute('data-index') || active?.tagName || '';
});

async function expectFocusTrapped(page: Page, dialog: string): Promise<void> {
  const count = await page.locator(`${dialog} button:not([disabled]), ${dialog} a[href], ${dialog} input:not([disabled])`).count();
  expect(count, `${dialog} focusable controls`).toBeGreaterThan(0);
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < count + 2; i++) {
      await page.keyboard.press(key);
      const inside = await page.evaluate(selector => document.querySelector(selector)!.contains(document.activeElement), dialog);
      expect(inside, `${dialog} keeps focus after ${key} #${i + 1} (focused ${await activeId(page)})`).toBe(true);
    }
  }
}

async function openCamp(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.goto('/?seed=24');
  await expect(page.locator('#start-button')).toBeEnabled();
}

async function enterRun(page: Page): Promise<void> {
  await page.locator('#start-button').click();
  await expect(page.locator('#game canvas')).toBeFocused();
  await sceneCall(page, 'game.loop.sleep();');
  // The region-start toast sits above dialogs for 2.5 s and can cover a dialog title (logged as a finding, not
  // fixed here: where event toasts go during a choice is a design call). Scan the dialogs once it has cleared.
  await expect(page.locator('#toast')).toBeHidden({ timeout: 5000 });
}

for (const size of sizes) {
  const tag = `${size.width}x${size.height}`;

  test(`camp screen has no serious axe violations at ${tag}`, async ({ page }, testInfo) => {
    await openCamp(page, size);
    await scan(page, testInfo, `camp-${tag}`);
    // The camp scrolls on short phones; rendered-contrast sampling only sees what is on screen.
    await page.locator('#menu').evaluate(menu => menu.scrollTo(0, menu.scrollHeight));
    await scan(page, testInfo, `camp-bottom-${tag}`);
  });

  test(`run HUD has no serious axe violations at ${tag}`, async ({ page }, testInfo) => {
    await openCamp(page, size);
    await enterRun(page);
    // HUD text sits over the live playfield, whose pixels come from the canvas and change as you move, and the
    // sampling removes the text-shadow halos the HUD relies on. Rendered contrast is attached for review, not asserted.
    await scan(page, testInfo, `hud-${tag}`, false);
    const special = testInfo.attachments.find(a => a.name === `contrast-hud-${tag}`)?.body?.toString() ?? '[]';
    const button = (JSON.parse(special) as { target: string; ratio: number; needed: number }[])
      .filter(item => item.target.startsWith('#special-'));
    // The special button has its own opaque background, so its contrast is asserted.
    expect(button.filter(item => item.ratio < item.needed), 'special button text contrast').toEqual([]);
  });

  test(`HUD backplate text keeps AA contrast over the brightest terrain at ${tag}`, async ({ page }, testInfo) => {
    await openCamp(page, size);
    await enterRun(page);
    const targets = ['#timer', '#timer-heading', '#stage-timer', '#health-number', '#health-max',
      '.health-caption > span:last-child', '#level-number', '.loadout-heading strong', '.loadout-heading span'];
    // Each plate must exist as a real background, not only a text-shadow.
    const alphas = await page.evaluate(() => ['.clock-wrap', '.health-caption', '.loadout-heading'].map(selector => {
      const channels = getComputedStyle(document.querySelector(selector)!).backgroundColor.match(/[\d.]+/g)!.map(Number);
      return { selector, alpha: channels.length > 3 ? channels[3] : 1 };
    }));
    expect(alphas.filter(item => item.alpha <= 0), 'HUD text plates have a background').toEqual([]);
    // Worst case for light text is the lightest backdrop. Sample the live canvas under the three plates with the
    // HUD hidden and take the lightest 2% of pixels, then also try pure white.
    const hidden = await page.addStyleTag({ content: '#ui{visibility:hidden!important}' });
    const lightest = await page.evaluate(async shot => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${shot.png}`)).blob());
      const scale = bitmap.width / innerWidth;
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
      const colours: { l: number; rgb: number[] }[] = [];
      for (const selector of ['.clock-wrap', '.health-caption', '.loadout-heading']) {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        const data = context.getImageData(Math.floor(rect.left * scale), Math.floor(rect.top * scale),
          Math.max(1, Math.floor(rect.width * scale)), Math.max(1, Math.floor(rect.height * scale))).data;
        for (let i = 0; i < data.length; i += 4) colours.push({ l: data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722,
          rgb: [data[i], data[i + 1], data[i + 2]] });
      }
      colours.sort((p, q) => q.l - p.l);
      return colours[Math.floor(colours.length * 0.02)].rgb;
    }, { png: (await page.screenshot()).toString('base64') });
    await hidden.evaluate(node => node.remove());
    const results: { backdrop: string; target: string; ratio: number; needed: number }[] = [];
    for (const backdrop of ['rgb(255,255,255)', `rgb(${lightest.join(',')})`]) {
      const style = await page.addStyleTag({ content: `#game canvas{visibility:hidden!important}#game{background:${backdrop}!important}` });
      for (const item of await renderedContrast(page, targets)) results.push({ backdrop, target: item.target, ratio: item.ratio, needed: item.needed });
      await style.evaluate(node => node.remove());
    }
    await testInfo.attach(`hud-backplate-contrast-${tag}`, { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
    expect(new Set(results.map(item => item.target)).size, 'every HUD plate text run was measured').toBe(targets.length);
    expect(results.filter(item => item.ratio < item.needed), 'HUD plate text contrast below WCAG AA').toEqual([]);
  });

  test(`boss bar, crest and bottom-line text keep AA contrast over every terrain at ${tag}`, async ({ page }, testInfo) => {
    await openCamp(page, size);
    await enterRun(page);
    // These three sit straight on the playfield with only a text-shadow, so the shadow is removed in sampling and the
    // worst case is the lightest canvas pixel under each. All three terrains (regions 0-2) are checked, then pure white.
    // The crest wordmark is display:none at 320 px wide, so it is measured only where it is shown; the leaf is ornament.
    const plates = ['#boss-name', '.crest', '.bottom-line'];
    const targets = ['#boss-name', '.crest span:last-child', '#kills', '#ability-name'];
    const expected = size.width > 365 ? targets.length : targets.length - 1;
    // Each plate must exist as a real background, not only a text-shadow.
    const alphas = await page.evaluate(selectors => selectors.map(selector => {
      const channels = getComputedStyle(document.querySelector(selector)!).backgroundColor.match(/[\d.]+/g)!.map(Number);
      return { selector, alpha: channels.length > 3 ? channels[3] : 1 };
    }), plates);
    expect(alphas.filter(item => item.alpha <= 0), 'boss/crest/bottom-line text plates have a background').toEqual([]);
    const results: { terrain: string; backdrop: string; target: string; ratio: number; needed: number }[] = [];
    for (const region of [0, 1, 2]) {
      await sceneCall(page, `s.region = ${region}; s.startRegion(); s.clearEnemies(); s.hero.setPosition(900, 900);`
        + ` s.spawnEnemy('boss', { x: 900, y: 690 });`);
      // The loop is asleep, so the HUD does not refresh itself; show the boss bar as the HUD would.
      await page.evaluate(() => document.querySelector('#boss-bar')!.classList.remove('hidden'));
      await expect(page.locator('#toast')).toBeHidden({ timeout: 5000 });
      await sceneCall(page, 'game.loop.step(); game.loop.step();');
      const hidden = await page.addStyleTag({ content: '#ui{visibility:hidden!important}' });
      const lightest = await page.evaluate(async ({ png, plates }) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
        const scale = bitmap.width / innerWidth;
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
        const colours: { l: number; rgb: number[] }[] = [];
        for (const selector of plates) {
          const rect = document.querySelector(selector)!.getBoundingClientRect();
          const data = context.getImageData(Math.floor(rect.left * scale), Math.floor(rect.top * scale),
            Math.max(1, Math.floor(rect.width * scale)), Math.max(1, Math.floor(rect.height * scale))).data;
          for (let i = 0; i < data.length; i += 4) colours.push({ l: data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722,
            rgb: [data[i], data[i + 1], data[i + 2]] });
        }
        colours.sort((p, q) => q.l - p.l);
        return colours[Math.floor(colours.length * 0.02)].rgb;
      }, { png: (await page.screenshot()).toString('base64'), plates });
      await hidden.evaluate(node => node.remove());
      for (const backdrop of ['rgb(255,255,255)', `rgb(${lightest.join(',')})`]) {
        const style = await page.addStyleTag({ content: `#game canvas{visibility:hidden!important}#game{background:${backdrop}!important}` });
        for (const item of await renderedContrast(page, targets)) {
          results.push({ terrain: `region ${region}`, backdrop, target: item.target, ratio: item.ratio, needed: item.needed });
        }
        await style.evaluate(node => node.remove());
      }
    }
    await testInfo.attach(`boss-crest-bottom-contrast-${tag}`, { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
    expect(new Set(results.map(item => item.target)).size, 'boss bar, crest and bottom-line text runs were measured').toBe(expected);
    expect(results.filter(item => item.ratio < item.needed), 'text contrast below WCAG AA').toEqual([]);
  });

  test(`pause dialog: axe, focus trap and focus return at ${tag}`, async ({ page }, testInfo) => {
    await openCamp(page, size);
    await enterRun(page);
    await page.locator('#pause-button').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#pause')).toBeVisible();
    await expect(page.locator('#pause-title')).toBeFocused();
    await scan(page, testInfo, `pause-${tag}`);
    await expectFocusTrapped(page, '#pause');
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause')).toBeHidden();
    // The game field is the control surface for the run, so closing the pause dialog hands focus back to it.
    await expect(page.locator('#game canvas')).toBeFocused();
  });

  test(`route gate dialog: axe, focus trap and focus return at ${tag}`, async ({ page }, testInfo) => {
    await openCamp(page, size);
    await enterRun(page);
    await sceneCall(page, 's.debugOfferRouteChoice();');
    await expect(page.locator('#route')).toBeVisible();
    await expect(page.locator('#route-title')).toBeFocused();
    await scan(page, testInfo, `route-${tag}`);
    await expectFocusTrapped(page, '#route');
    await page.locator('#route-cards [data-route]').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#route')).toBeHidden();
    await expect(page.locator('#game canvas')).toBeFocused();
  });

  test(`growth dialog: axe and focus trap at ${tag}`, async ({ page }, testInfo) => {
    await openCamp(page, size);
    await enterRun(page);
    await sceneCall(page, 's.debugOfferUpgrade();');
    await expect(page.locator('#upgrade')).toBeVisible();
    await expect(page.locator('#upgrade-title')).toBeFocused();
    await scan(page, testInfo, `growth-${tag}`);
    await expectFocusTrapped(page, '#upgrade');
    await page.locator('#upgrade-cards [data-index]').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#upgrade')).toBeHidden();
    await expect(page.locator('#game canvas')).toBeFocused();
  });

  for (const won of [true, false]) {
    const name = won ? 'victory' : 'defeat';
    test(`${name} result dialog: axe, focus trap and focus return at ${tag}`, async ({ page }, testInfo) => {
      await openCamp(page, size);
      await enterRun(page);
      await sceneCall(page, `s.finish(${won});`);
      await expect(page.locator('#result')).toBeVisible();
      await expect(page.locator('#result-title')).toBeFocused();
      await expect(page.locator('#result-title')).toHaveText(won ? 'The wild endures' : 'Your story grows');
      await scan(page, testInfo, `${name}-${tag}`);
      await expectFocusTrapped(page, '#result');
      await page.locator('#menu-button').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#result')).toBeHidden();
      await expect(page.locator('#start-button')).toBeFocused();
    });
  }
}

test('reduced-motion preference stops DOM animation on camp and HUD', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCamp(page, sizes[0]);
  await enterRun(page);
  const moving = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('#ui *'))
    .filter(node => node.getClientRects().length > 0)
    .map(node => ({ node, style: getComputedStyle(node) }))
    .filter(({ style }) => style.animationName !== 'none'
      && style.animationIterationCount === 'infinite'
      && style.animationPlayState === 'running')
    .map(({ node, style }) => `${node.id || node.className} ${style.animationName}`));
  expect(moving).toEqual([]);
  const slow = await page.evaluate(() => {
    const toMs = (value: string) => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000);
    return Array.from(document.querySelectorAll<HTMLElement>('#ui *'))
      .map(node => ({ node, ms: Math.max(...getComputedStyle(node).transitionDuration.split(',').map(toMs)) }))
      .filter(({ ms }) => ms > 1)
      .map(({ node, ms }) => `${node.id || node.className} ${ms}ms`);
  });
  expect(slow).toEqual([]);
});

test('without a reduced-motion preference the mission art still animates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openCamp(page, sizes[0]);
  await enterRun(page);
  await expect(page.locator('#objective-art')).not.toHaveCSS('animation-name', 'none');
});
