import { expect, test } from '@playwright/test';

// Refactor guard for GroveScene.ts. It plays one seeded run at a fixed step (the game.step approach
// from autosave-bound.spec.ts) with scripted input, records the full save snapshot once per game
// second plus every HUD, event, route-choice and upgrade callback, and hashes the stream. A pure
// extraction from the scene must leave this digest byte-identical. If a deliberate gameplay change
// moves it, re-run with UPDATE_SNAPSHOT_GUARD=1 and paste the printed digest below.
// Recorded on unmodified GroveScene.ts at 0921bf1 (desktop Chrome via Playwright).
const EXPECTED_DIGEST = '7ae7073a67782ee05e2d49f6f5ffde80f1d9ab6a97786c93c1b8fbe8e0c95434';

const SAVE_KEY = 'grovebound-run-v1';
const FPS = 30;
const PLAY_SECONDS = 150;

test('a seeded scripted run produces the recorded snapshot digest', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.goto('/?seed=24');
  await expect(page.locator('#start-button')).toBeEnabled();

  const run = await page.evaluate(async ({ frameMs, frames, fps, key }) => {
    const path = (document.querySelector('script[src*="/src/main.ts"]') as HTMLScriptElement).src;
    const { scene: s, game } = await import(path);
    // Stop the real loop before the run exists, so no wall-clock frame ever touches it.
    game.loop.sleep();
    const t0 = Number(game.loop.time) || 0;
    const stream: string[] = [];
    const record = (tag: string, value: unknown) => stream.push(`${tag} ${JSON.stringify(value)}`);
    const callbacks = s.callbacks;
    const original = { ...callbacks };
    let routeOffers = 0; let upgrades = 0; let events = 0; let ended: unknown = null;
    callbacks.onHud = (hud: unknown) => { record('hud', hud); original.onHud(hud); };
    callbacks.onEvent = (message: string) => { events++; record('event', message); original.onEvent(message); };
    callbacks.onRouteChoice = (region: number) => { routeOffers++; record('route', region); original.onRouteChoice(region); };
    callbacks.onUpgrade = (options: unknown) => { upgrades++; record('upgrade', options); original.onUpgrade(options); };
    callbacks.onEnd = (result: unknown) => { ended = result; record('end', result); original.onEnd(result); };

    s.beginRun('ranger', 'bow', 5, ['axe', 'thorns', 'bow', 'staff'], true, false, true, 'axe', 24, 'expedition', 'breaker');
    s.setDebugPilot(true);
    const snapshot = () => { s.saveSnapshot(); return localStorage.getItem(key); };
    record('snapshot', snapshot());

    const routeResults: unknown[] = [];
    let mined = 0; let marked = 0;
    for (let i = 1; i <= frames && s.running; i++) {
      // Scripted actions at fixed game-time ticks (frame indices, so they do not depend on float sums).
      if (i % (fps / 2) === 0) { const before = s.mineCooldown; s.mineNearbyField(); if (s.mineCooldown !== before) mined++; }
      if (i % (fps * 9) === 0) { s.debugMarkTerrain(); if (s.markedField) marked++; record('marked', s.markedField ? s.objects.indexOf(s.markedField) : null); }
      if (i === fps * 40 || i === fps * 95) s.debugAdvanceRegion();
      if (s.routeChoiceRegion !== null) {
        // Wound the hero so the heal granted on taking a route shows in the stream.
        s.health = Math.max(1, s.health - 40);
        // One invalid pick first: the gate must refuse a route that belongs to the other region.
        const wrong = s.routeChoiceRegion === 1 ? 'moonflame' : 'coolantRun';
        const right = s.routeChoiceRegion === 1 ? 'coolantRun' : 'moonflame';
        routeResults.push([s.routeChoiceRegion, wrong, s.chooseRoute(wrong)]);
        routeResults.push([s.routeChoiceRegion, right, s.chooseRoute(right)]);
        record('routeResults', routeResults);
      }
      if (s.choosing && s.upgradeOptions.length) s.chooseUpgrade(s.upgradeOptions[upgrades % s.upgradeOptions.length]);
      game.step(t0 + i * frameMs, frameMs);
      if (i % fps === 0) record('snapshot', snapshot());
    }
    record('final', snapshot());

    const bytes = new TextEncoder().encode(stream.join('\n'));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const digest = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return { digest, entries: stream.length, bytes: bytes.length, region: s.region as number, seconds: s.seconds as number,
      kills: s.kills as number, running: s.running as boolean, routeOffers, routeResults, upgrades, events, mined, marked, ended };
  }, { frameMs: 1000 / FPS, frames: PLAY_SECONDS * FPS, fps: FPS, key: SAVE_KEY });

  await testInfo.attach('snapshot-guard', { body: JSON.stringify(run, null, 2), contentType: 'application/json' });
  console.log(`snapshot-guard digest=${run.digest} entries=${run.entries} bytes=${run.bytes} region=${run.region} `
    + `seconds=${run.seconds.toFixed(3)} kills=${run.kills} routeOffers=${run.routeOffers} upgrades=${run.upgrades} `
    + `mined=${run.mined} marked=${run.marked} routeResults=${JSON.stringify(run.routeResults)}`);

  // The script really exercised the clusters this guard protects.
  expect(run.routeOffers).toBeGreaterThanOrEqual(2);
  expect(run.routeResults).toContainEqual([1, 'moonflame', false]);
  expect(run.routeResults).toContainEqual([1, 'coolantRun', true]);
  expect(run.mined).toBeGreaterThan(0);
  expect(run.marked).toBeGreaterThan(0);
  expect(run.upgrades).toBeGreaterThan(0);

  if (process.env.UPDATE_SNAPSHOT_GUARD) return;
  expect(run.digest).toBe(EXPECTED_DIGEST);
});
