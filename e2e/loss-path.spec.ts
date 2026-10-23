import { expect, test, type Page } from '@playwright/test';

// GOAL.md: the final release is verified by a complete win and a loss. This spec plays a real loss: the hero's
// health reaches 0 through GroveScene.takeDamage, whose `if (this.health <= 0) this.finish(false)` is the only
// caller of finish(false). Nothing here calls finish, sets health, skips a region, or heals.
//
// The run is a recorded losing row of the weak-pilot slice (reports/pilot-matrix/weak-pilot.json):
//   ranger/waylight/forgeAssault/moonflame@w13+off-weakR500N4: loss in Ember Quarry at 5:03 (303.40 s), 197 kills.
// It is replayed exactly as scripts/pilot-matrix.mjs runCell drives a --skill 500:4 cell: same progress profile, the
// debug PILOT button, the real loop slept before START, fixed 1000/60 ms game.scene.update steps from the page, route
// forks taken by clicking the real route card, and the createPilotSkillFilter wrapper (500 ms reaction, every 4th
// special press). Runs are deterministic at fixed steps, so the same seed loses at the same tick.
//
// Sound: Ranger's progress profile is saved with muted: true (as the matrix does), and playwright.config.ts launches
// Chrome with --mute-audio. The spec asserts the in-game mute is on before the run starts.

const RUN_KEY = 'grovebound-run-v1';
const PROGRESS_KEY = 'grovebound-progress-v2';
const LOSS = {
  id: 'ranger/waylight/forgeAssault/moonflame@w13+off-weakR500N4',
  hero: 'ranger', seed: 13, quarry: 'forgeAssault', moon: 'moonflame',
  skill: { reactionMs: 500, actEvery: 4 },
  progress: { bestRegion: 1, muted: true },
  // From the recorded row.
  expected: { seconds: 303.40, region: 1, kills: 197, steps: 18204 },
};
const CAP_SECONDS = 16 * 60;

async function replay(page: Page, cell: typeof LOSS) {
  await page.evaluate(async ({ cell }) => {
    const { scene: s, game } = await import((document.querySelector('script[src*="/src/main.ts"]') as HTMLScriptElement).src);
    const pilotPath = '/src/game/pilot.ts';
    const { createPilotSkillFilter } = await import(pilotPath);
    game.loop.sleep();
    (document.querySelector('#start-button') as HTMLButtonElement).click();
    const w = window as unknown as { __loss: Record<string, unknown> };
    const lp: Record<string, any> = w.__loss = { s, game, t: Number(game.loop.time) || 0, steps: 0, result: null,
      forks: [] as number[], routeClicks: 0, upgradeFallbacks: 0, unpauses: 0, finishCalls: [] as boolean[],
      deathHealth: null, bossSpawnedAtDeath: null, savedAtEnd: 'unset' };
    // Weak-pilot arm, as in scripts/pilot-matrix.mjs runCell: the normal pilot decides, its presses are captured and
    // passed through createPilotSkillFilter before reaching the real castSpecial/focusWeapon and the stick.
    const filter = createPilotSkillFilter(cell.skill);
    const proto = Object.getPrototypeOf(s);
    let captured: { kind: string; weapon?: string }[] | null = null;
    s.castSpecial = function () { if (captured) captured.push({ kind: 'special' }); else proto.castSpecial.call(this); };
    s.focusWeapon = function (weapon: string) { if (captured) captured.push({ kind: 'command', weapon }); else proto.focusWeapon.call(this, weapon); };
    s.updateDebugPilot = function () {
      const actions = captured = [];
      try { proto.updateDebugPilot.call(this); } finally { captured = null; }
      const out = filter(this.seconds, { direction: { x: this.joyVector.x, y: this.joyVector.y }, actions });
      this.joyVector.set(out.direction.x, out.direction.y);
      for (const action of out.actions) {
        if (!this.running) return;
        if (action.kind === 'special') this.castSpecial(); else this.focusWeapon(action.weapon);
      }
    };
    // Observe (not replace) finish so the spec can show the loss came through health <= 0.
    s.finish = function (won: boolean) {
      if (this.running) { lp.finishCalls.push(won); lp.deathHealth = this.health; lp.bossSpawnedAtDeath = !!this.bossSpawned; }
      return proto.finish.call(this, won);
    };
    const onEnd = s.callbacks.onEnd;
    s.callbacks.onEnd = (result: unknown) => {
      lp.result = result; onEnd(result);
      lp.savedAtEnd = localStorage.getItem('grovebound-run-v1');
    };
  }, { cell });

  for (;;) {
    const state = await page.evaluate(({ cell, cap }) => {
      const lp = (window as unknown as { __loss: Record<string, any> }).__loss; const { s, game } = lp;
      const frameMs = 1000 / 60;
      const chunkEnd = s.seconds + 30;
      while (s.running && !lp.result && s.seconds < chunkEnd && s.seconds < cap) {
        if (s.routeChoiceRegion !== null) {
          const route = s.routeChoiceRegion === 1 ? cell.quarry : cell.moon;
          (document.querySelector(`#route-cards [data-route="${route}"]`) as HTMLButtonElement).click();
          lp.forks.push(s.seconds); lp.routeClicks++;
        }
        if (s.choosing) { s.chooseUpgrade(s.upgradeOptions[0]); lp.upgradeFallbacks++; }
        if (s.pausedByUser) { s.setPaused(false); lp.unpauses++; }
        lp.t += frameMs;
        game.scene.update(lp.t, frameMs);
        lp.steps++;
      }
      return { running: s.running as boolean, ended: !!lp.result, seconds: s.seconds as number };
    }, { cell, cap: CAP_SECONDS });
    if (state.ended || !state.running || state.seconds >= CAP_SECONDS) break;
  }

  return page.evaluate(() => {
    const lp = (window as unknown as { __loss: Record<string, any> }).__loss; const { s } = lp;
    return { result: lp.result ? { won: lp.result.won, seconds: lp.result.seconds, region: lp.result.region, kills: lp.result.kills } : null,
      steps: lp.steps, forks: lp.forks, routeClicks: lp.routeClicks, upgradeFallbacks: lp.upgradeFallbacks, unpauses: lp.unpauses,
      finishCalls: lp.finishCalls, deathHealth: lp.deathHealth, bossSpawnedAtDeath: lp.bossSpawnedAtDeath,
      savedAtEnd: lp.savedAtEnd, running: s.running, quarryRoute: s.quarryRoute, heroId: s.heroId };
  });
}

test(`a weak-pilot run loses through health <= 0 and the camp starts clean (${LOSS.id})`, async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ key, progress }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key: PROGRESS_KEY, progress: LOSS.progress });

  await page.goto(`/?seed=${LOSS.seed}&debug=1`);
  await expect(page.locator('#start-button')).toBeEnabled();
  // No sound while Daniel is at the PC: the in-game mute is on (and the browser runs with --mute-audio).
  await expect(page.locator('#muted')).toBeChecked();
  const soundOn = await page.evaluate(async () => (await import('/src/game/audio.ts' as string)).soundFx.enabled as boolean);
  expect(soundOn).toBe(false);
  const seedsBefore = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).seeds ?? 0, PROGRESS_KEY);

  await page.locator(`#hero-options [data-hero="${LOSS.hero}"]`).click();
  await page.locator('[data-debug="pilot"]').click();
  const started = Date.now();
  const run = await replay(page, LOSS);
  const wallSeconds = (Date.now() - started) / 1000;
  await testInfo.attach('loss-run', { body: JSON.stringify({ cell: LOSS.id, wallSeconds, ...run }, null, 2), contentType: 'application/json' });

  // The run really lost, through the health <= 0 branch, at the recorded tick.
  expect(run.result, 'run ended').not.toBeNull();
  expect(run.result!.won).toBe(false);
  expect(run.finishCalls).toEqual([false]);
  expect(run.deathHealth).toBe(0);
  expect(run.result!.region).toBe(LOSS.expected.region);
  expect(run.result!.seconds).toBeCloseTo(LOSS.expected.seconds, 1);
  expect(run.result!.kills).toBe(LOSS.expected.kills);
  expect(run.steps).toBe(LOSS.expected.steps);
  expect(run.heroId).toBe(LOSS.hero);
  expect(run.quarryRoute).toBe(LOSS.quarry);
  expect(run.routeClicks).toBe(1);
  expect(run.running).toBe(false);

  // Defeat dialog.
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#result-title')).toHaveText('Your story grows');
  await expect(page.locator('#result-eyebrow')).toHaveText('THE GROVE REMEMBERS');
  await expect(page.locator('#result-copy')).toContainText('Ember Quarry');
  await expect(page.locator('#result-time')).toHaveText('5:03');
  await expect(page.locator('#result-kills')).toHaveText(String(LOSS.expected.kills));

  // Seeds awarded: seedsForRun(197 kills, lost) = 2 + min(3, floor(197 / 35)) = 5, shown and saved.
  const earned = 2 + Math.min(3, Math.floor(LOSS.expected.kills / 35));
  await expect(page.locator('#result-seeds')).toHaveText(`+${earned} ✦`);
  const progressAfter = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), PROGRESS_KEY);
  expect(progressAfter.seeds).toBe(seedsBefore + earned);
  expect(progressAfter.muted).toBe(true);

  // Saved run cleared at the moment of defeat and still absent on the result screen.
  expect(run.savedAtEnd).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), RUN_KEY)).toBeNull();

  // Back at camp: no stale RESUME button, seed count updated.
  await page.locator('#menu-button').click();
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#resume-run-button')).toBeHidden();
  await expect(page.locator('#seed-count')).toHaveText(`✦ ${seedsBefore + earned} SEEDS`);
  // A reload does not bring a saved run back either.
  await page.reload();
  await expect(page.locator('#start-button')).toBeEnabled();
  await expect(page.locator('#resume-run-button')).toBeHidden();

  // A clean new run starts: running, full health, region 1, clock near zero, and it autosaves a fresh snapshot.
  await page.locator('#start-button').click();
  await expect(page.locator('#hud')).toBeVisible();
  const fresh = await page.evaluate(async key => {
    const { scene: s, game } = await import((document.querySelector('script[src*="/src/main.ts"]') as HTMLScriptElement).src);
    game.loop.sleep();
    const t0 = Number(game.loop.time) || 0;
    const startSeconds = s.seconds as number;
    for (let i = 1; i <= 150; i++) game.scene.update(t0 + i * 1000 / 60, 1000 / 60);
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    return { running: s.running as boolean, health: s.health as number, maxHealth: s.stats.maxHealth as number,
      region: s.region as number, startSeconds, seconds: s.seconds as number, kills: s.kills as number,
      savedSeconds: saved?.seconds ?? null };
  }, RUN_KEY);
  expect(fresh.running).toBe(true);
  expect(fresh.region).toBe(0);
  expect(fresh.startSeconds).toBeLessThan(1);
  expect(fresh.health).toBeGreaterThan(0);
  expect(fresh.seconds).toBeGreaterThan(fresh.startSeconds);
  expect(fresh.savedSeconds).not.toBeNull();
  expect(fresh.savedSeconds).toBeLessThan(5);
  expect(errors).toEqual([]);
});
