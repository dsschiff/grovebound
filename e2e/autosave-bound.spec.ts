import { expect, test } from '@playwright/test';

// GOAL.md: "an abrupt crash loses no more than the latest two seconds of play".
// GroveScene.update() writes a snapshot whenever its saveClock reaches 2 s of game time.
// This spec drives the real game loop at a fixed step without ever calling saveSnapshot,
// pausing, or hiding the page, then restores the last stored snapshot in a fresh browser
// context, as a crash would leave it. Desktop Chromium only; not a real Android app kill.

const SAVE_KEY = 'grovebound-run-v1';
const BOUND_SECONDS = 2;
const PLAY_SECONDS = 5;

for (const fps of [60, 30]) {
  test(`a crash after ${PLAY_SECONDS}s of play at ${fps} fps loses at most two seconds`, async ({ page, browser }, testInfo) => {
    const frameSeconds = 1 / fps;
    const limit = BOUND_SECONDS + frameSeconds + 1e-9;

    await page.goto('/?seed=24');
    await expect(page.locator('#start-button')).toBeEnabled();
    await page.locator('#start-button').click();

    const run = await page.evaluate(async ({ frameMs, frames, key }) => {
      const path = (document.querySelector('script[src*="/src/main.ts"]') as HTMLScriptElement).src;
      const { scene: s, game } = await import(path);
      game.loop.sleep();
      const t0 = Number(game.loop.time) || 0;
      const live = () => ({ seconds: s.seconds as number, x: s.hero.x as number, y: s.hero.y as number });
      const start = { ...live(), stored: JSON.parse(localStorage.getItem(key)!).seconds as number };
      const history = [live()];
      const writes: number[] = [];
      let raw = localStorage.getItem(key);
      let maxLag = 0;
      let stalled = 0;
      for (let i = 1; i <= frames; i++) {
        // Walk a half circle so the hero position changes on every frame and ends away from the start.
        const angle = i / frames * Math.PI;
        s.joyVector.set(Math.cos(angle) * 0.5, Math.sin(angle) * 0.5);
        game.step(t0 + i * frameMs, frameMs);
        if (!s.running || s.choosing || s.pausedByUser) stalled++;
        const tick = live();
        history.push(tick);
        const current = localStorage.getItem(key);
        if (current !== raw) { writes.push(tick.seconds); raw = current; }
        maxLag = Math.max(maxLag, tick.seconds - JSON.parse(raw!).seconds);
      }
      // The crash happens here: the page gets no further frame, save, pagehide or unload.
      const storage = Object.fromEntries(Object.keys(localStorage).map(name => [name, localStorage.getItem(name)!]));
      return { start, lastLive: history[history.length - 1], history, writes, maxLag, stalled, storage };
    }, { frameMs: 1000 / fps, frames: Math.round(PLAY_SECONDS * fps), key: SAVE_KEY });

    await page.close({ runBeforeUnload: false });

    const stored = JSON.parse(run.storage[SAVE_KEY]);
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL, viewport: testInfo.project.use.viewport ?? undefined,
    });
    await context.addInitScript(entries => {
      for (const [name, value] of Object.entries(entries)) localStorage.setItem(name, value);
    }, run.storage);
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

    const savedTick = run.history.find(tick => Math.abs(tick.seconds - restored.seconds) < 1e-9);
    const evidence = { fps, limit, start: run.start, lastLive: run.lastLive, writes: run.writes, maxLag: run.maxLag,
      stalled: run.stalled, stored: { seconds: stored.seconds, x: stored.x, y: stored.y }, restored, savedTick,
      lostSeconds: run.lastLive.seconds - restored.seconds };
    await testInfo.attach(`autosave-bound-${fps}fps`, { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });

    // The run really played about five seconds of game time and the hero moved. The real loop may
    // tick a few frames between the start click and loop.sleep(), so measure from where it stood.
    expect(run.start.seconds - run.start.stored).toBeLessThanOrEqual(limit);
    expect(run.stalled).toBe(0);
    expect(run.lastLive.seconds - run.start.seconds).toBeCloseTo(PLAY_SECONDS, 6);
    expect(Math.hypot(run.lastLive.x - run.start.x, run.lastLive.y - run.start.y)).toBeGreaterThan(50);

    // While playing, the stored snapshot never lagged the live clock by more than 2 s plus one frame,
    // and the periodic autosave wrote at least twice (around 2 s and 4 s).
    expect(run.maxLag).toBeLessThanOrEqual(limit);
    expect(run.writes.length).toBeGreaterThanOrEqual(2);
    expect(run.writes[0] - run.start.stored).toBeLessThanOrEqual(limit);
    for (let i = 1; i < run.writes.length; i++) expect(run.writes[i] - run.writes[i - 1]).toBeLessThanOrEqual(limit);

    // After the crash the stored snapshot is behind the last live tick (real loss), but by no more than the bound.
    expect(stored.seconds).toBeLessThan(run.lastLive.seconds);
    expect(run.lastLive.seconds - stored.seconds).toBeLessThanOrEqual(limit);

    // The revived run resumes exactly the stored state, which is the live state of a tick within the bound.
    expect(restored.running).toBe(true);
    expect(restored.seconds).toBeCloseTo(stored.seconds, 9);
    expect(restored.x).toBeCloseTo(stored.x, 6);
    expect(restored.y).toBeCloseTo(stored.y, 6);
    expect(savedTick, 'restored clock matches a live tick').toBeDefined();
    expect(restored.x).toBeCloseTo(savedTick!.x, 6);
    expect(restored.y).toBeCloseTo(savedTick!.y, 6);
    expect(run.lastLive.seconds - restored.seconds).toBeGreaterThanOrEqual(0);
    expect(run.lastLive.seconds - restored.seconds).toBeLessThanOrEqual(limit);
  });
}
