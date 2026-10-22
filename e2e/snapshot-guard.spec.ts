import { expect, test } from '@playwright/test';

// Refactor guard for GroveScene.ts. It plays one seeded run at a fixed step (the game.step approach
// from autosave-bound.spec.ts) with scripted input, records the full save snapshot once per game
// second plus every HUD, event, route-choice and upgrade callback, and hashes the stream. A pure
// extraction from the scene must leave this digest byte-identical. If a deliberate gameplay change
// moves it, re-run with UPDATE_SNAPSHOT_GUARD=1 and paste the printed digest below.
// Recorded on unmodified GroveScene.ts at 0921bf1 (desktop Chrome via Playwright).
const EXPECTED_DIGEST = 'c47339b22aec012ccf61a39bc4c34ec8154f8bed9e9d3221e1d2ac6d510a3563';

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

    const snapshot = () => { s.saveSnapshot(); return localStorage.getItem(key); };
    // Three runs so every verge contract (stag, seedheart, waylight) and every quarry and moon route is played.
    const scenarios = [
      { seed: 24, hero: 'ranger', weapon: 'bow', support: 'axe', mastery: 5, kit: 'breaker', routes: ['coolantRun', 'moonflame'] },
      { seed: 10, hero: 'warden', weapon: 'axe', support: 'staff', mastery: 2, kit: 'conductor', routes: ['forgeAssault', 'altarRite'] },
      { seed: 7, hero: 'ember', weapon: 'staff', support: 'thorns', mastery: 4, kit: 'forager', routes: ['forgeAssault', 'moonflame'] },
    ];
    const summaries: unknown[] = [];
    const routeResults: unknown[] = [];
    let tick = 0;
    for (const scenario of scenarios) {
      s.beginRun(scenario.hero, scenario.weapon, scenario.mastery, ['axe', 'thorns', 'bow', 'staff'], true, false, true,
        scenario.support, scenario.seed, 'expedition', scenario.kit);
      s.setDebugPilot(true);
      record('snapshot', snapshot());
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
          const offer = s.routeChoiceRegion as 1 | 2;
          const wrong = scenario.routes[2 - offer];
          const right = scenario.routes[offer - 1];
          routeResults.push([offer, wrong, s.chooseRoute(wrong)]);
          routeResults.push([offer, right, s.chooseRoute(right)]);
          record('routeResults', routeResults);
        }
        if (s.choosing && s.upgradeOptions.length) s.chooseUpgrade(s.upgradeOptions[upgrades % s.upgradeOptions.length]);
        game.step(t0 + (++tick) * frameMs, frameMs);
        if (i % fps === 0) record('snapshot', snapshot());
      }
      record('final', snapshot());
      summaries.push({ seed: scenario.seed, hero: scenario.hero, region: s.region, seconds: Number(s.seconds.toFixed(3)), kills: s.kills,
        running: s.running, mined, marked, objects: [...new Set(s.objects.map((object: { kind: string }) => object.kind))].join(',') });
    }

    const bytes = new TextEncoder().encode(stream.join('\n'));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const digest = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return { digest, entries: stream.length, bytes: bytes.length, summaries, routeOffers, routeResults, upgrades, events, ended };
  }, { frameMs: 1000 / FPS, frames: PLAY_SECONDS * FPS, fps: FPS, key: SAVE_KEY });

  await testInfo.attach('snapshot-guard', { body: JSON.stringify(run, null, 2), contentType: 'application/json' });
  console.log(`snapshot-guard digest=${run.digest} entries=${run.entries} bytes=${run.bytes} routeOffers=${run.routeOffers} `
    + `upgrades=${run.upgrades} events=${run.events}\n  routeResults=${JSON.stringify(run.routeResults)}\n`
    + run.summaries.map(summary => `  ${JSON.stringify(summary)}`).join('\n'));

  // The script really exercised the clusters this guard protects: every route was refused from the
  // wrong gate and taken from the right one, fields were mined and marked, and blessings were chosen.
  expect(run.routeOffers).toBe(6);
  for (const route of ['coolantRun', 'forgeAssault']) expect(run.routeResults).toContainEqual([1, route, true]);
  for (const route of ['moonflame', 'altarRite']) expect(run.routeResults).toContainEqual([2, route, true]);
  expect(run.routeResults.filter(result => (result as unknown[])[2] === false)).toHaveLength(6);
  for (const summary of run.summaries as { mined: number; marked: number; region: number }[]) {
    expect(summary.region).toBe(2);
    expect(summary.mined).toBeGreaterThan(0);
    expect(summary.marked).toBeGreaterThan(0);
  }
  expect(run.upgrades).toBeGreaterThan(0);

  if (process.env.UPDATE_SNAPSHOT_GUARD) return;
  expect(run.digest).toBe(EXPECTED_DIGEST);
});
