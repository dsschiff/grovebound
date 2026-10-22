import { expect, test } from '@playwright/test';

// src/main.ts saves the run (scene.saveSnapshot) when the document becomes hidden, e.g. the player
// switches apps on a phone. The 2 s autosave alone would lose up to 2 s. This spec plays at a fixed
// step to ~1.25 s after an autosave, hides the page, copies storage at once, restores in a fresh
// browser context and checks the restored clock and hero position equal the live state at hide time.
// Desktop Chromium only; the hide is a synthetic visibilitychange/pagehide, not a real Android event.

const SAVE_KEY = 'grovebound-run-v1';
const FPS = 60;
const GAP_AFTER_AUTOSAVE = 1.25;

type Mode = 'visibilitychange' | 'pagehide' | 'none';

async function playAndHide(page: import('@playwright/test').Page, mode: Mode) {
  await page.goto('/?seed=24');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#start-button').click();
  return page.evaluate(async ({ frameMs, gap, key, mode }) => {
    const path = (document.querySelector('script[src*="/src/main.ts"]') as HTMLScriptElement).src;
    const { scene: s, game } = await import(path);
    game.loop.sleep();
    const t0 = Number(game.loop.time) || 0;
    const live = () => ({ seconds: s.seconds as number, x: s.hero.x as number, y: s.hero.y as number });
    let raw = localStorage.getItem(key);
    let lastWrite: number | null = null;
    let i = 0;
    while (i < 60 * 30) {
      i++;
      s.joyVector.set(Math.cos(i / 120) * 0.5, Math.sin(i / 120) * 0.5);
      game.step(t0 + i * frameMs, frameMs);
      const current = localStorage.getItem(key);
      if (current !== raw) { lastWrite = s.seconds; raw = current; }
      if (lastWrite !== null && s.seconds - lastWrite >= gap) break;
    }
    const atHide = live();
    const storedBefore = JSON.parse(localStorage.getItem(key)!).seconds as number;
    if (mode === 'visibilitychange') {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    } else if (mode === 'pagehide') {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    }
    const storedAfter = JSON.parse(localStorage.getItem(key)!);
    const storage = Object.fromEntries(Object.keys(localStorage).map(name => [name, localStorage.getItem(name)!]));
    return { atHide, lastWrite, storedBefore, storedAfter: { seconds: storedAfter.seconds as number, x: storedAfter.x as number, y: storedAfter.y as number }, storage, ranSeconds: s.seconds as number };
  }, { frameMs: 1000 / FPS, gap: GAP_AFTER_AUTOSAVE, key: SAVE_KEY, mode });
}

async function restore(browser: import('@playwright/test').Browser, testInfo: import('@playwright/test').TestInfo, storage: Record<string, string>) {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL, viewport: testInfo.project.use.viewport ?? undefined,
  });
  await context.addInitScript(entries => {
    for (const [name, value] of Object.entries(entries)) localStorage.setItem(name, value);
  }, storage);
  const revived = await context.newPage();
  await revived.goto('/?seed=24');
  await expect(revived.locator('#start-button')).toBeEnabled();
  await revived.locator('#resume-run-button').click();
  const restored = await revived.evaluate(async () => {
    const path = (document.querySelector('script[src*="/src/main.ts"]') as HTMLScriptElement).src;
    const { scene: s, game } = await import(path);
    game.loop.sleep();
    return { seconds: s.seconds as number, x: s.hero.x as number, y: s.hero.y as number, running: s.running as boolean };
  });
  await context.close();
  return restored;
}

const frame = 1 / FPS;

test('control: with no hide event the stored snapshot lags the live clock', async ({ page, browser }, testInfo) => {
  const run = await playAndHide(page, 'none');
  await page.close({ runBeforeUnload: false });
  const restored = await restore(browser, testInfo, run.storage);
  await testInfo.attach('tabhide-control', { body: JSON.stringify({ run: { ...run, storage: undefined }, restored }, null, 2), contentType: 'application/json' });
  expect(run.atHide.seconds - run.lastWrite!).toBeGreaterThanOrEqual(GAP_AFTER_AUTOSAVE);
  expect(run.storedAfter.seconds).toBeCloseTo(run.lastWrite!, 9);
  expect(run.atHide.seconds - restored.seconds).toBeGreaterThanOrEqual(GAP_AFTER_AUTOSAVE);
  expect(run.atHide.seconds - restored.seconds).toBeLessThanOrEqual(2 + frame + 1e-9);
  expect(Math.hypot(run.atHide.x - restored.x, run.atHide.y - restored.y)).toBeGreaterThan(5);
});

test('hiding the tab (visibilitychange) saves the live state between autosaves', async ({ page, browser }, testInfo) => {
  const run = await playAndHide(page, 'visibilitychange');
  await page.close({ runBeforeUnload: false });
  const restored = await restore(browser, testInfo, run.storage);
  await testInfo.attach('tabhide-visibilitychange', { body: JSON.stringify({ run: { ...run, storage: undefined }, restored }, null, 2), contentType: 'application/json' });
  // The hide happened between autosaves: the stored clock before the event lagged by over a second.
  expect(run.atHide.seconds - run.storedBefore).toBeGreaterThanOrEqual(GAP_AFTER_AUTOSAVE);
  // The handler wrote a fresh snapshot, and a fresh context restores the live state at hide time.
  expect(run.storedAfter.seconds).toBeGreaterThan(run.storedBefore);
  expect(restored.running).toBe(true);
  expect(Math.abs(restored.seconds - run.atHide.seconds)).toBeLessThanOrEqual(frame);
  expect(Math.abs(restored.x - run.atHide.x)).toBeLessThan(1e-3);
  expect(Math.abs(restored.y - run.atHide.y)).toBeLessThan(1e-3);
});

// Characterises today's behaviour: src/main.ts listens only for visibilitychange, so a bare pagehide
// writes nothing and the stored clock stays where the last autosave left it. When someone adds a
// pagehide save this test fails on purpose; change it then to assert the restored state equals the
// live state at hide time, as the visibilitychange test does.
test('pagehide alone does not save (no pagehide handler in src/main.ts today)', async ({ page, browser }, testInfo) => {
  const run = await playAndHide(page, 'pagehide');
  await page.close({ runBeforeUnload: false });
  const restored = await restore(browser, testInfo, run.storage);
  await testInfo.attach('tabhide-pagehide', { body: JSON.stringify({ run: { ...run, storage: undefined }, restored }, null, 2), contentType: 'application/json' });
  expect(run.atHide.seconds - run.storedBefore).toBeGreaterThanOrEqual(GAP_AFTER_AUTOSAVE);
  expect(run.storedAfter.seconds).toBe(run.storedBefore);
  expect(restored.seconds).toBeCloseTo(run.storedBefore, 9);
  expect(run.atHide.seconds - restored.seconds).toBeGreaterThanOrEqual(GAP_AFTER_AUTOSAVE);
});
