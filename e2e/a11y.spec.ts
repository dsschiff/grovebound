import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

// Automated accessibility pass over the DOM screens. axe-core inspects markup, ARIA and CSS; it cannot see what
// Phaser draws inside the game canvas, so canvas content (foes, hazards, the field itself) is out of scope here.
// This is not a screen-reader (TalkBack) verification.

const sizes = [{ width: 390, height: 844 }, { width: 320, height: 568 }];
const BLOCKING = new Set(['serious', 'critical']);

async function scan(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations
    .filter(violation => BLOCKING.has(violation.impact ?? ''))
    .map(violation => ({ id: violation.id, impact: violation.impact, help: violation.help,
      targets: violation.nodes.map(node => node.target.join(' ')) }));
  await testInfo.attach(`axe-${label}`, {
    body: JSON.stringify({ blocking, all: results.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      incomplete: results.incomplete.map(v => ({ id: v.id, nodes: v.nodes.length })) }, null, 2),
    contentType: 'application/json',
  });
  expect(blocking, `${label}: serious/critical axe violations`).toEqual([]);
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
}

for (const size of sizes) {
  const tag = `${size.width}x${size.height}`;

  test(`camp screen has no serious axe violations at ${tag}`, async ({ page }, testInfo) => {
    await openCamp(page, size);
    await scan(page, testInfo, `camp-${tag}`);
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
