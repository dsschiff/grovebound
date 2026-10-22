// Headless full-run pilot matrix: heroes x Verge contracts x Quarry routes x Moonfen routes.
//
// Each cell loads the localhost dev build with ?debug=1&seed=N, selects the hero, turns on the existing
// debug pilot (the PILOT button: it steers, uses the special, and auto-picks upgrades; it never advances
// timers, teleports, or heals), clicks START, then drives the real GroveScene at fixed 60 Hz steps from
// inside the page, as scripts/profile-browser.mjs and e2e/autosave-bound.spec.ts do. Route forks are taken
// by clicking the real route card only after the scene offers the fork on its own (gate contact); the
// script never calls debugOfferRouteChoice, so every recorded fork is a natural gate trigger.
//
// Not part of `npm run test:browser`: one cell is ~10.5 min of game time. Results are written after every
// cell, and a rerun skips cells already in the output file (resumable). Usage:
//   node scripts/pilot-matrix.mjs [--out reports/pilot-matrix/pilot-matrix.json] [--heroes warden,ranger,ember]
//     [--contracts waylight,seedheart,stag] [--quarry coolantRun,forgeAssault] [--moon moonflame,altarRite]
//     [--limit N] [--concurrency 3] [--render] [--rerun] [--port 4191] [--seed-set A|B|C] [--repeats N]
//     [--commands off|on] [--pairing on|off] [--focus keep|restore] [--baseline reports/pilot-matrix/<earlier>.json]
// --pairing off (pilot never lands a chain) and --focus restore (pilot re-focuses the starting weapon after a
// command) need --commands on; they add -solo / -restore to the id suffix (arms cmd, cmd-solo, cmd-restore,
// cmd-solo-restore). With all four arms and off in one file the summary adds a plain/resonance/focus decomposition.
// --commands on also lets the pilot tap weapon command slots (GroveScene.setDebugPilotCommands, decision in
// src/game/pilot.ts pilotCommand); those cells get a `+cmd` id suffix so on and off runs can share one file.
// Every cell records pilotCommands, commands fired (counted from command-recharge restarts, so it measures the
// game state rather than trusting the pilot) and resonances (RunMetrics.resonances). --baseline compares each
// commands-off row (and each row of an arm the earlier file contains) with the same id in an earlier file and
// reports whether the outcome is identical.
// --render steps the whole Phaser game (game.step, including WebGL/canvas render) instead of only the scene
// update; logic is identical, render is just slower. Desktop Chrome CPU only; not human or Android evidence.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const flag = name => argv.includes(`--${name}`);
const list = (name, fallback) => opt(name, fallback).split(',').map(value => value.trim()).filter(Boolean);

const outPath = resolve(root, opt('out', 'reports/pilot-matrix/pilot-matrix.json'));
const summaryPath = outPath.replace(/\.json$/, '.md');
const heroes = list('heroes', 'warden,ranger,ember');
const contracts = list('contracts', 'waylight,seedheart,stag');
const quarryRoutes = list('quarry', 'coolantRun,forgeAssault');
const moonRoutes = list('moon', 'moonflame,altarRite');
const limit = Number(opt('limit', '0')) || Infinity;
const concurrency = Math.max(1, Number(opt('concurrency', '3')));
const render = flag('render');
const rerun = flag('rerun');
const port = Number(opt('port', '4191'));
const repeats = Math.max(1, Number(opt('repeats', '1')));
const commands = opt('commands', 'off');
if (commands !== 'on' && commands !== 'off') throw new Error('--commands must be on or off');
// Pilot-only command variants (src/game/pilot.ts): --pairing off never lands a chain (the "solo" arm); --focus restore
// taps the starting weapon again after each command so focus does not follow the last command. Defaults are PR #9.
const pairing = opt('pairing', 'on');
if (pairing !== 'on' && pairing !== 'off') throw new Error('--pairing must be on or off');
const focusMode = opt('focus', 'keep');
if (focusMode !== 'keep' && focusMode !== 'restore') throw new Error('--focus must be keep or restore');
if (commands === 'off' && (pairing !== 'on' || focusMode !== 'keep')) throw new Error('--pairing and --focus need --commands on');
const arm = commands === 'off' ? 'off' : 'cmd' + (pairing === 'off' ? '-solo' : '') + (focusMode === 'restore' ? '-restore' : '');
const baselinePath = opt('baseline', null) ? resolve(root, opt('baseline', null)) : null;
const baseline = baselinePath ? JSON.parse(await readFile(baselinePath, 'utf8')) : null;

// Fixed seeds, one per Verge contract (src/game/objectives.ts vergeMission). The Quarry/Moonfen route is chosen
// at the fork, so the seed's own default route does not matter; the seed still fixes layout and RNG.
const SEED_SETS = {
  A: { waylight: 101, seedheart: 202, stag: 155 },
  B: { waylight: 7, seedheart: 1000, stag: 4123 },
  C: { waylight: 2021, seedheart: 3010, stag: 10015 },
};
const seedSet = opt('seed-set', 'A');
if (!SEED_SETS[seedSet]) throw new Error('unknown --seed-set ' + seedSet);
const CONTRACT_SEEDS = SEED_SETS[seedSet];
const idSuffix = (seedSet === 'A' ? '' : '@' + seedSet) + (arm === 'off' ? '' : '+' + arm);
// Minimum progress that unlocks each hero (logic.ts availableHero), all at mastery 0. Warden is a fresh save.
const PROGRESS = {
  warden: null,
  ranger: { bestRegion: 1, muted: true },
  ember: { bestRegion: 1, victories: 1, muted: true },
};
const GAME_CAP_SECONDS = 16 * 60; // stop a run that has not ended by 16:00 of game time
const SOFTLOCK_SECONDS = 60; // no objective/region/guardian progress for 60 s of game time
const SOFTLOCK_ABORT_SECONDS = 150; // stop the cell once it has been stuck this long

const cells = [];
for (let run = 1; run <= repeats; run++)
  for (const hero of heroes) for (const contract of contracts) for (const quarry of quarryRoutes) for (const moon of moonRoutes)
    cells.push({ id: `${hero}/${contract}/${quarry}/${moon}` + idSuffix + (run > 1 ? `#${run}` : ''), cell: `${hero}/${contract}/${quarry}/${moon}`,
      run, seedSet, hero, contract, quarry, moon, seed: CONTRACT_SEEDS[contract], pilotCommands: commands, arm,
      pilotPairing: pairing, pilotFocus: focusMode });

let store = { cells: {} };
try { store = JSON.parse(await readFile(outPath, 'utf8')); } catch { /* first run */ }
const todo = cells.filter(cell => rerun || !store.cells[cell.id]).slice(0, limit);
console.log(`pilot-matrix: ${cells.length} cells in scope, ${cells.filter(c => store.cells[c.id]).length} already in ${outPath}, running ${todo.length} (concurrency ${concurrency}, ${render ? 'render' : 'scene-only'} steps)`);

const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: true } });
await server.listen();
const baseURL = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });

async function save() {
  store.meta = { updated: new Date().toISOString(), script: 'scripts/pilot-matrix.mjs', stepHz: 60, seedSets: SEED_SETS,
    stepping: 'fixed 1000/60 ms steps driven from the page; see cell.stepping', 
    softlockRule: `no change for ${SOFTLOCK_SECONDS}s of game time in region, fork state, required-objective hp/position/count, gate state, or guardian hp, excluding the guardian countdown after objectives are done`,
    gameCapSeconds: GAME_CAP_SECONDS, progressProfiles: PROGRESS,
    commandCounting: 'a command is counted when a weapon command recharge restarts (commandCooldown rises by >0.5 s in one step); resonances are RunMetrics.resonances' };
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(store, null, 2));
  await writeFile(summaryPath, summarize(store));
}

function clock(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function dangerLine(rows) {
  const lows = rows.map(r => r.minHealthFraction).filter(value => typeof value === 'number').sort((a, b) => a - b);
  if (!lows.length) return '';
  const median = lows.length % 2 ? lows[(lows.length - 1) / 2] : (lows[lows.length / 2 - 1] + lows[lows.length / 2]) / 2;
  return `Danger (lowest HP as a fraction of max HP at that moment): ${lows.filter(v => v < 0.5).length} runs below 50%, ${lows.filter(v => v < 0.25).length} below 25%; median low point ${Math.round(median * 100)}%, worst ${Math.round(lows[0] * 100)}%.`;
}

function summarize({ cells: done }) {
  const rows = Object.values(done).sort((a, b) => a.id.localeCompare(b.id));
  const inWindow = rows.filter(r => r.won && r.gameSeconds >= 600 && r.gameSeconds <= 720);
  const lines = ['# Grovebound pilot matrix', '',
    `Generated by \`scripts/pilot-matrix.mjs\` (${new Date().toISOString()}). ${rows.length} runs recorded across ${new Set(rows.map(r => r.cell ?? r.id)).size} distinct cells.`,
    'Debug pilot on the normal timer, fixed 60 Hz steps, no stage skips, healing, or forced growth. Automated route evidence only, not human balance or Android performance.', '',
    `Wins: ${rows.filter(r => r.won).length}/${rows.length}. Wins inside 10:00–12:00: ${inWindow.length}. Softlocks: ${rows.filter(r => r.softlock).length}.`,
    dangerLine(rows),
    `Forks offered by natural gate contact: ${rows.reduce((n, r) => n + r.forks.filter(f => f.natural).length, 0)}; by debug trigger: 0 (the script never calls it).`, '',
    '| Cell (hero/contract/quarry/moon) | Seed | Result | Clock | In 10–12? | Splits | Damage taken | Lowest HP % (hp/max at time) | Kills | Softlock (max stall s) | Forks natural | Routes match |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    const within = r.gameSeconds >= 600 && r.gameSeconds <= 720;
    lines.push(`| ${r.id} | ${r.seed} | ${r.outcome} | ${clock(r.gameSeconds)} | ${r.won ? (within ? 'yes' : 'NO') : '—'} | ${r.regionSeconds.map(clock).join(' / ')} | ${Math.round(r.damageTaken)} | ${r.minHealthFractionAtSeconds != null ? `${Math.round(r.minHealthFraction * 100)}% (${r.minHealthFractionHp}/${r.minHealthFractionMaxHp} at ${clock(r.minHealthFractionAtSeconds)})` : '—'} | ${r.kills} | ${r.softlock ? 'YES' : 'no'} (${Math.round(r.maxStallSeconds)}) | ${r.forks.filter(f => f.natural).length}/${r.forks.length} | ${r.routesMatch ? 'yes' : 'NO'} |`);
  }
  lines.push('', '## Per hero', '', '| Hero | Runs | Wins | Clock min–max | Damage taken min / median / max | Lowest HP % worst / median | Runs below 50% HP |', '|---|---|---|---|---|---|---|');
  for (const hero of [...new Set(rows.map(r => r.hero))]) {
    const group = rows.filter(r => r.hero === hero);
    const secs = group.map(r => r.gameSeconds); const taken = group.map(r => Math.round(r.damageTaken)).sort((a, b) => a - b);
    const lows = group.map(r => r.minHealthFraction ?? 1).sort((a, b) => a - b);
    const lowest = lows[0];
    const lowMedian = lows.length % 2 ? lows[(lows.length - 1) / 2] : (lows[lows.length / 2 - 1] + lows[lows.length / 2]) / 2;
    const below50 = lows.filter(v => v < 0.5).length;
    lines.push(`| ${hero} | ${group.length} | ${group.filter(r => r.won).length} | ${clock(Math.min(...secs))}–${clock(Math.max(...secs))} | ${taken[0]} / ${taken[Math.floor(taken.length / 2)]} / ${taken[taken.length - 1]} | ${Math.round(lowest * 100)}% / ${Math.round(lowMedian * 100)}% | ${below50} |`);
  }
  const groups = new Map();
  for (const r of rows) { const key = r.cell ?? r.id.split('#')[0]; groups.set(key, [...(groups.get(key) ?? []), r]); }
  if ([...groups.values()].some(group => group.length > 1)) {
    lines.push('', '## Spread per cell across seed sets and repeats', '',
      '| Cell | Runs | Wins | Clock min–max | Damage taken min–max |', '|---|---|---|---|---|');
    for (const [key, group] of groups) {
      const secs = group.map(r => r.gameSeconds); const taken = group.map(r => Math.round(r.damageTaken));
      lines.push(`| ${key} | ${group.length} | ${group.filter(r => r.won).length} | ${clock(Math.min(...secs))}–${clock(Math.max(...secs))} | ${Math.min(...taken)}–${Math.max(...taken)} |`);
    }
  }
  lines.push(...commandSection(rows));
  lines.push(...decompositionSection(rows));
  if (baseline) lines.push(...baselineSection(rows));
  const missing = cells.filter(cell => !done[cell.id]).map(cell => cell.id);
  if (missing.length) lines.push('', `Not yet run in this invocation's scope (${missing.length}): ${missing.join(', ')}`);
  return lines.join('\n') + '\n';
}

const BASELINE_FIELDS = ['outcome', 'gameSeconds', 'endRegion', 'damageTaken', 'foeDamage', 'kills', 'level', 'regionSeconds',
  'objectives', 'hazards', 'blessings', 'weapons', 'forks', 'chosenRoutes', 'minHealth', 'minHealthFraction',
  'minHealthAtSeconds', 'minHealthFractionAtSeconds', 'maxStallSeconds', 'upgradeFallbacks', 'steps'];

// Commands-on rows also compare what the pilot did.
const BASELINE_COMMAND_FIELDS = ['commands', 'commandsByWeapon', 'resonances'];

function baselineSection(rows) {
  const name = baselinePath.slice(root.length + 1).split('\\').join('/');
  // Off rows always; command rows only for arms the baseline file contains (a new arm has nothing to match).
  const baselineArms = new Set(Object.values(baseline.cells).map(armOf));
  const compared = rows.filter(row => armOf(row) === 'off' || baselineArms.has(armOf(row)));
  const lines = ['', `## Runs vs baseline \`${name}\` (arms: ${[...new Set(compared.map(armOf))].sort().join(', ')})`, '',
    `Fields compared exactly: ${BASELINE_FIELDS.join(', ')}; command arms also ${BASELINE_COMMAND_FIELDS.join(', ')}.`, '',
    '| Run | Baseline row | Identical | Differing fields |', '|---|---|---|---|'];
  for (const r of compared) {
    const before = baseline.cells[r.id];
    if (!before) { lines.push(`| ${r.id} | missing | — | — |`); continue; }
    const fields = armOf(r) === 'off' ? BASELINE_FIELDS : [...BASELINE_FIELDS, ...BASELINE_COMMAND_FIELDS];
    const differing = fields.filter(field => JSON.stringify(before[field]) !== JSON.stringify(r[field]));
    lines.push(`| ${r.id} | found | ${differing.length ? 'NO' : 'yes'} | ${differing.join(', ') || '—'} |`);
  }
  const identical = compared.filter(r => baseline.cells[r.id]
    && (armOf(r) === 'off' ? BASELINE_FIELDS : [...BASELINE_FIELDS, ...BASELINE_COMMAND_FIELDS])
      .every(field => JSON.stringify(baseline.cells[r.id][field]) === JSON.stringify(r[field])));
  lines.push('', `Identical to baseline: ${identical.length}/${compared.length}.`);
  return lines;
}

function signed(value, digits = 0) {
  const text = value.toFixed(digits);
  return Number(text) > 0 ? '+' + text : Number(text) === 0 ? (0).toFixed(digits) : text;
}

// Rows written before the arm field existed are the PR #9 arms.
const armOf = r => r.arm ?? ((r.pilotCommands ?? 'off') === 'on' ? 'cmd' : 'off');
const ARM_LABEL = {
  cmd: 'pairing on, focus follows the last command (PR #9)',
  'cmd-solo': 'pairing off (never lands a chain), focus follows the last command',
  'cmd-restore': 'pairing on, focus restored to the starting weapon',
  'cmd-solo-restore': 'pairing off, focus restored to the starting weapon',
};
const offRowFor = (rows, r) => rows.find(o => armOf(o) === 'off' && o.cell === r.cell && o.seedSet === r.seedSet && o.run === r.run);

function commandSection(rows) {
  const arms = [...new Set(rows.map(armOf))].filter(a => a !== 'off').sort();
  return arms.flatMap(a => armSection(rows, a));
}

function armSection(rows, armName) {
  const on = rows.filter(r => armOf(r) === armName);
  if (!on.length) return [];
  const offFor = r => offRowFor(rows, r);
  const lines = ['', `## Weapon commands, arm \`${armName}\` (${ARM_LABEL[armName] ?? armName}) vs never (off)`, '',
    'Same cell, seed, and stepping; only the pilot command flags differ. Deltas are on minus off. Clock is the full-run clear time. Off-focus s is game seconds with focus away from the starting weapon.', '',
    '| Cell | Seed | Off result | On result | Clock off → on (Δ s) | Damage taken off → on (Δ) | Lowest HP % off → on | Foe damage Δ | Kills Δ | Commands on (by weapon) | Resonances on | Off-focus s | Commands off |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  const pairs = [];
  for (const r of [...on].sort((a, b) => a.id.localeCompare(b.id))) {
    const off = offFor(r);
    if (!off) { lines.push(`| ${r.cell}@${r.seedSet} | ${r.seed} | not run | ${r.outcome} | — | — | — | — | — | ${r.commands} | ${r.resonances} | ${r.offFocusSeconds ?? 'n/a'} | — |`); continue; }
    pairs.push([off, r]);
    const byWeapon = Object.entries(r.commandsByWeapon ?? {}).map(([w, n]) => `${w} ${n}`).join(', ');
    lines.push(`| ${r.cell}@${r.seedSet} | ${r.seed} | ${off.outcome} | ${r.outcome} | ${clock(off.gameSeconds)} → ${clock(r.gameSeconds)} (${signed(r.gameSeconds - off.gameSeconds, 1)}) | ${Math.round(off.damageTaken)} → ${Math.round(r.damageTaken)} (${signed(r.damageTaken - off.damageTaken)}) | ${Math.round(off.minHealthFraction * 100)}% → ${Math.round(r.minHealthFraction * 100)}% | ${signed(r.foeDamage - off.foeDamage)} | ${signed(r.kills - off.kills)} | ${r.commands} (${byWeapon || '—'}) | ${r.resonances} | ${r.offFocusSeconds ?? 'n/a'} | ${off.commands ?? 'n/a'} |`);
  }
  if (!pairs.length) return lines;
  const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
  const median = values => { const v = [...values].sort((a, b) => a - b); return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2; };
  lines.push('', '| Hero | Pairs | Wins off / on | Mean Δ clock s | Δ damage taken mean (median) | Runs with less / more damage taken | Mean Δ lowest HP pts | Commands per run | Resonances per run | Resonances per command | Off-focus s per run |',
    '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const hero of [...new Set(pairs.map(([off]) => off.hero)), 'all']) {
    const group = hero === 'all' ? pairs : pairs.filter(([off]) => off.hero === hero);
    const dTaken = group.map(([off, r]) => r.damageTaken - off.damageTaken);
    const cmds = group.map(([, r]) => r.commands); const res = group.map(([, r]) => r.resonances);
    const totalCmds = cmds.reduce((a, b) => a + b, 0);
    lines.push(`| ${hero} | ${group.length} | ${group.filter(([off]) => off.won).length} / ${group.filter(([, r]) => r.won).length} | ${signed(mean(group.map(([off, r]) => r.gameSeconds - off.gameSeconds)), 1)} | ${signed(mean(dTaken))} (${signed(median(dTaken))}) | ${dTaken.filter(d => d < 0).length} / ${dTaken.filter(d => d > 0).length} | ${signed(mean(group.map(([off, r]) => (r.minHealthFraction - off.minHealthFraction) * 100)), 1)} | ${mean(cmds).toFixed(1)} | ${mean(res).toFixed(1)} | ${totalCmds ? (res.reduce((a, b) => a + b, 0) / totalCmds).toFixed(2) : '—'} | ${group.every(([, r]) => typeof r.offFocusSeconds === 'number') ? mean(group.map(([, r]) => r.offFocusSeconds)).toFixed(0) : 'n/a'} |`);
  }
  return lines;
}

// Splits the PR #9 change (cmd vs off) into plain commands, resonance, and focus, from per-hero means of paired
// deltas against the same off run. Two orders, because the parts need not add independently:
//   order 1: plain = solo-restore − off; resonance = restore − solo-restore; focus = cmd − restore
//   order 2: plain = solo-restore − off; focus = solo − solo-restore; resonance = cmd − solo
function decompositionSection(rows) {
  const need = ['cmd', 'cmd-solo', 'cmd-restore', 'cmd-solo-restore'];
  const present = new Set(rows.map(armOf));
  if (!need.every(a => present.has(a))) return [];
  const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
  const metrics = [
    ['Damage taken', r => r.damageTaken, 0],
    ['Lowest HP (pts of max)', r => r.minHealthFraction * 100, 1],
    ['Clear time (s)', r => r.gameSeconds, 1],
  ];
  const lines = ['', '## Decomposition: plain commands, resonance, focus', '',
    'Per-hero means of (arm − off) over runs that exist in all five arms. Order 1: plain = solo-restore; resonance = restore − solo-restore; focus = cmd − restore. Order 2: focus = solo − solo-restore; resonance = cmd − solo. The two orders differ when the parts interact.', '',
    '| Hero | Runs | Metric | Off mean | Total (cmd) | Plain | Resonance (order 1) | Focus (order 1) | Focus (order 2) | Resonance (order 2) |',
    '|---|---|---|---|---|---|---|---|---|---|'];
  const offRows = rows.filter(r => armOf(r) === 'off');
  for (const hero of [...new Set(offRows.map(r => r.hero)), 'all']) {
    const sets = [];
    for (const off of offRows.filter(r => hero === 'all' || r.hero === hero)) {
      const byArm = Object.fromEntries(need.map(a => [a, rows.find(r => armOf(r) === a && r.cell === off.cell && r.seedSet === off.seedSet && r.run === off.run)]));
      if (need.every(a => byArm[a])) sets.push({ off, ...byArm });
    }
    if (!sets.length) continue;
    for (const [name, pick, digits] of metrics) {
      const d = a => mean(sets.map(set => pick(set[a]) - pick(set.off)));
      const total = d('cmd'), plain = d('cmd-solo-restore'), restore = d('cmd-restore'), solo = d('cmd-solo');
      lines.push(`| ${hero} | ${sets.length} | ${name} | ${mean(sets.map(set => pick(set.off))).toFixed(digits)} | ${signed(total, digits)} | ${signed(plain, digits)} | ${signed(restore - plain, digits)} | ${signed(total - restore, digits)} | ${signed(solo - plain, digits)} | ${signed(total - solo, digits)} |`);
    }
  }
  return lines;
}

async function runCell(cell) {
  const started = Date.now();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const errors = [];
  if (PROGRESS[cell.hero]) await context.addInitScript(p => {
    if (!localStorage.getItem('grovebound-progress-v2')) localStorage.setItem('grovebound-progress-v2', JSON.stringify(p));
  }, PROGRESS[cell.hero]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseURL}/?seed=${cell.seed}&debug=1`);
  await page.locator('#start-button').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#start-button').disabled);
  await page.locator(`#hero-options [data-hero="${cell.hero}"]`).click();
  await page.locator('[data-debug="pilot"]').click();

  await page.evaluate(async ({ cell, render }) => {
    const { scene: s, game } = await import(document.querySelector('script[src*="/src/main.ts"]').src);
    const { objectivesLeft } = await import('/src/game/objectives.ts');
    const { REGIONS } = await import('/src/game/logic.ts');
    // Sleep the real loop before START so no wall-clock-timed frames run; every frame of the run is a fixed step.
    game.loop.sleep();
    document.querySelector('#start-button').click();
    const pm = window.__pm = { s, game, render, secondsAtStart: s.seconds, objectivesLeft, durations: REGIONS.map(r => r.duration), t: Number(game.loop.time) || 0, steps: 0, result: null, forks: [],
      routeClicks: 0, upgradeFallbacks: 0, unpauses: 0, lastSig: '', lastProgressAt: s.seconds, maxStall: 0, stallAt: null, minHealth: Infinity, minHealthAt: null,
      minHealthFraction: Infinity, minHealthFractionAt: null, minHealthFractionHp: null, minHealthFractionMax: null,
      commands: 0, commandsByWeapon: {}, commandPrev: {}, offFocusSeconds: 0 };
    if (cell.pilotCommands === 'on') s.setDebugPilotCommands(true, { pairing: cell.pilotPairing !== 'off', focusRestore: cell.pilotFocus === 'restore' });
    const callbacks = s.callbacks;
    const onEnd = callbacks.onEnd; callbacks.onEnd = result => { pm.result = result; onEnd(result); };
    const onRoute = callbacks.onRouteChoice;
    callbacks.onRouteChoice = region => {
      const gate = s.objects.find(o => o.kind === 'gate');
      pm.forks.push({ region, atSeconds: s.seconds, stageSeconds: s.stageSeconds, gateDistance: gate ? Math.hypot(s.hero.x - gate.x, s.hero.y - gate.y) : null });
      // The scene's own trigger fires only within 82 px of an open gate; the debug trigger has no distance check.
      const fork = pm.forks[pm.forks.length - 1]; fork.natural = !!gate?.active && fork.gateDistance < 82;
      onRoute(region);
    };
    pm.startHero = s.heroId; pm.contract = s.objects.find(o => ['waylight', 'seedheart', 'stag'].includes(o.kind))?.kind ?? null;
    pm.sig = () => {
      const req = s.objects.filter(o => ['waylight', 'seedheart', 'stag', 'pump', 'coolant', 'forge', 'moonflame', 'altar', 'bloom', 'ward'].includes(o.kind));
      const guardian = s.enemies.find(e => e.kind === 'boss' || e.kind === 'gatekeeper');
      const gate = s.objects.find(o => o.kind === 'gate');
      return JSON.stringify([s.region, s.routeChoiceRegion, s.gatekeeperSpawned, gate?.active,
        guardian ? Math.round(guardian.hp) : null,
        req.map(o => [o.kind, Math.round(o.hp * 10), o.active, Math.round(o.x / 10), Math.round(o.y / 10)])]);
    };
  }, { cell, render });

  const frameMs = 1000 / 60;
  let state;
  for (;;) {
    state = await page.evaluate(({ cell, frameMs, cap, softlockAbort }) => {
      const pm = window.__pm; const { s, game } = pm;
      const routeFor = region => region === 1 ? cell.quarry : cell.moon;
      const chunkEnd = s.seconds + 30;
      while (s.running && !pm.result && s.seconds < chunkEnd) {
        if (s.routeChoiceRegion !== null) {
          const card = document.querySelector(`#route-cards [data-route="${routeFor(s.routeChoiceRegion)}"]`);
          if (card) { card.click(); pm.routeClicks++; } else s.chooseRoute(routeFor(s.routeChoiceRegion));
        }
        if (s.choosing) { s.chooseUpgrade(s.upgradeOptions[0]); pm.upgradeFallbacks++; }
        if (s.pausedByUser) { s.setPaused(false); pm.unpauses++; }
        pm.t += frameMs;
        const before = s.seconds;
        if (pm.render) game.step(pm.t, frameMs); else game.scene.update(pm.t, frameMs);
        pm.steps++;
        // Read-only: game seconds whose auto attacks ran with focus away from the starting weapon (weapons[0]).
        if (s.seconds > before && s.focusedWeapon !== s.weapons[0].id) pm.offFocusSeconds += s.seconds - before;
        // Read-only command count: a tap that fires restarts that slot's recharge (GroveScene.focusWeapon).
        for (const weapon of s.weapons) {
          const now = weapon.commandCooldown ?? 0;
          if (now > (pm.commandPrev[weapon.id] ?? 0) + 0.5) {
            pm.commands++; pm.commandsByWeapon[weapon.id] = (pm.commandsByWeapon[weapon.id] ?? 0) + 1;
          }
          pm.commandPrev[weapon.id] = now;
        }
        // Track the lowest absolute HP and the lowest HP fraction separately: max HP grows with upgrades, so the two
        // low points are usually at different moments.
        if (s.running && s.health < pm.minHealth) { pm.minHealth = s.health; pm.minHealthAt = s.seconds; }
        if (s.running && s.health / s.stats.maxHealth < pm.minHealthFraction) {
          pm.minHealthFraction = s.health / s.stats.maxHealth; pm.minHealthFractionAt = s.seconds;
          pm.minHealthFractionHp = s.health; pm.minHealthFractionMax = s.stats.maxHealth;
        }
        if (pm.steps % 30 === 0) {
          const sig = pm.sig();
          // After the required objectives are done, the guardian countdown is the progress the run is waiting on.
          const countdown = !s.gatekeeperSpawned && s.stageSeconds < pm.durations[s.region] && pm.objectivesLeft(s.region, s.objects) === 0;
          if (sig !== pm.lastSig || countdown) { pm.lastSig = sig; pm.lastProgressAt = s.seconds; }
          const stall = s.seconds - pm.lastProgressAt;
          if (stall > pm.maxStall) { pm.maxStall = stall; if (stall >= 60 && pm.stallAt === null) pm.stallAt = pm.lastProgressAt; }
          if (stall >= softlockAbort) break;
        }
        if (s.seconds >= cap) break;
      }
      return { seconds: s.seconds, region: s.region, running: s.running, ended: !!pm.result, stall: s.seconds - pm.lastProgressAt,
        maxStall: pm.maxStall, kills: s.kills, health: s.health, steps: pm.steps };
    }, { cell, frameMs, cap: GAME_CAP_SECONDS, softlockAbort: SOFTLOCK_ABORT_SECONDS });
    if (state.ended || !state.running || state.seconds >= GAME_CAP_SECONDS || state.stall >= SOFTLOCK_ABORT_SECONDS) break;
  }

  const final = await page.evaluate(() => {
    const pm = window.__pm; const { s } = pm;
    return { result: pm.result, forks: pm.forks, routeClicks: pm.routeClicks, upgradeFallbacks: pm.upgradeFallbacks,
      unpauses: pm.unpauses, minHealth: pm.minHealth, minHealthFraction: pm.minHealthFraction, minHealthAt: pm.minHealthAt,
      minHealthFractionAt: pm.minHealthFractionAt, minHealthFractionHp: pm.minHealthFractionHp, minHealthFractionMax: pm.minHealthFractionMax, maxStall: pm.maxStall, stallAt: pm.stallAt, steps: pm.steps, startHero: pm.startHero,
      contract: pm.contract, quarryRoute: s.quarryRoute, moonRoute: s.moonRoute, seconds: s.seconds, region: s.region,
      metrics: s.metrics, kills: s.kills, level: s.level, health: s.health, weapons: s.weapons.map(w => `${w.id}:${w.rank}`),
      commands: pm.commands, commandsByWeapon: pm.commandsByWeapon, offFocusSeconds: pm.offFocusSeconds, startWeapon: s.weapons[0].id,
      restoreFires: s.pilotRestoreFires ?? 0 };
  });
  await context.close();
  const result = final.result;
  const metrics = result?.metrics ?? final.metrics;
  const won = !!result?.won;
  const outcome = result ? (won ? 'win' : `loss (region ${result.region + 1})`)
    : final.seconds >= GAME_CAP_SECONDS ? 'cap (no end by 16:00)' : 'softlock abort';
  const reachedMoon = final.region >= 2 || (result && result.region >= 2);
  return {
    id: cell.id, cell: cell.cell, run: cell.run, seedSet: cell.seedSet, hero: cell.hero, contract: cell.contract, quarry: cell.quarry, moon: cell.moon, seed: cell.seed,
    heroConfirmed: final.startHero === cell.hero, contractConfirmed: final.contract === cell.contract,
    outcome, won, gameSeconds: result?.seconds ?? final.seconds, endRegion: result ? result.region : final.region,
    damageTaken: metrics.damageTaken, foeDamage: metrics.foeDamage, kills: result?.kills ?? final.kills,
    level: result?.level ?? final.level, regionSeconds: metrics.regionSeconds, objectives: metrics.wards,
    hazards: metrics.hazards, blessings: metrics.blessings, weapons: final.weapons,
    softlock: final.maxStall >= SOFTLOCK_SECONDS, maxStallSeconds: final.maxStall, stallStartedAt: final.stallAt,
    forks: final.forks, routeClicks: final.routeClicks,
    routesMatch: (final.region < 1 || final.quarryRoute === cell.quarry) && (!reachedMoon || final.moonRoute === cell.moon),
    chosenRoutes: { quarry: final.quarryRoute, moon: final.moonRoute },
    minHealth: Math.round(final.minHealth), minHealthFraction: Math.round(final.minHealthFraction * 1000) / 1000,
    minHealthAtSeconds: final.minHealthAt, minHealthFractionAtSeconds: final.minHealthFractionAt,
    minHealthFractionHp: Math.round(final.minHealthFractionHp), minHealthFractionMaxHp: Math.round(final.minHealthFractionMax), upgradeFallbacks: final.upgradeFallbacks, unpauses: final.unpauses, steps: final.steps,
    stepping: render ? 'game.step (update + render)' : 'game.scene.update (no render)',
    pilotCommands: cell.pilotCommands, commands: final.commands, commandsByWeapon: final.commandsByWeapon,
    resonances: metrics.resonances ?? 0,
    arm: cell.arm, pilotPairing: cell.pilotPairing, pilotFocus: cell.pilotFocus, startWeapon: final.startWeapon,
    offFocusSeconds: Math.round(final.offFocusSeconds * 10) / 10, restoreFires: final.restoreFires,
    pageErrors: errors, wallSeconds: Math.round((Date.now() - started) / 1000), finishedAt: new Date().toISOString(),
  };
}

const queue = [...todo];
let failures = 0;
async function worker() {
  for (let cell = queue.shift(); cell; cell = queue.shift()) {
    try {
      const row = await runCell(cell);
      store.cells[cell.id] = row;
      await save();
      console.log(`${row.id}: ${row.outcome} at ${clock(row.gameSeconds)}, taken ${Math.round(row.damageTaken)}, stall ${Math.round(row.maxStallSeconds)}s, forks ${row.forks.map(f => f.natural ? 'natural' : 'debug').join('+') || 'none'}, wall ${row.wallSeconds}s`);
    } catch (error) {
      failures++;
      console.error(`${cell.id}: harness error ${error.message}`);
    }
  }
}
try {
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  await save();
} finally {
  await browser.close();
  await server.close();
}
if (failures) process.exitCode = 1;
