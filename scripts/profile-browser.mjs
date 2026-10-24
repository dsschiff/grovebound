import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

// --budget: fail when desktop-CPU frame timings regress past generous limits.
// Limits come from the WORKLOG baseline (median/p95 ms, seeds 24/88/144): median 1.3/2.7/3.0 at 3x, p95 2.3/4.7/5.4 at 2x,
// rounded up to 0.1 ms. Desktop Chrome CPU only; not Android FPS or GPU time.
// GROVE_BUDGET_SCALE multiplies every limit (for forcing a breach in checks); do not commit a changed value.
const args = process.argv.slice(2);
const budgetMode = args.includes('--budget');
const outputPath = args.find(arg => !arg.startsWith('--')) || 'profile.json';
const BUDGETS = { 24: { median: 3.9, p95: 4.6 }, 88: { median: 8.1, p95: 9.4 }, 144: { median: 9.0, p95: 10.8 } };
const budgetScale = Number(process.env.GROVE_BUDGET_SCALE || 1);

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', args: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(process.env.GROVE_URL || 'http://127.0.0.1:4178/?seed=24');
await page.locator('#start-button').waitFor({ state: 'visible' });
await page.waitForFunction(() => !document.querySelector('#start-button').disabled);
await page.locator('#start-button').click();
const results = await page.evaluate(async () => {
  const { scene: s, game } = await import(document.querySelector('script[src*="/src/main.ts"]').src);
  game.loop.sleep();
  const sample = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return { calls: values.length, totalMs: values.reduce((a, b) => a + b, 0),
      medianMs: sorted[Math.floor(sorted.length / 2)] || 0,
      p95Ms: sorted[Math.floor(sorted.length * 0.95)] || 0 };
  };
  const results = [];
  for (const config of [{ name: 'verge', seed: 24, region: 0, foes: 12, seconds: 0 },
    { name: 'quarry-surge', seed: 88, region: 1, foes: 45, seconds: 110 },
    { name: 'moonfen-boss', seed: 144, region: 2, foes: 44, seconds: 160 }]) {
    s.beginRun('warden', 'axe', 0, ['axe', 'bow'], false, false, false, 'bow', config.seed);
    s.region = config.region; s.startRegion(); s.stageSeconds = config.seconds;
    s.stats.maxHealth = 500; s.stats.regen = 20; s.health = 500;
    for (let i = 0; i < config.foes; i++) {
      const angle = i * Math.PI * 2 / config.foes;
      s.spawnEnemy(i % 5 === 0 && config.region ? 'wisp' : i % 7 === 0 ? 'thornback' : 'gnarl',
        { x: 900 + Math.cos(angle) * 320, y: 900 + Math.sin(angle) * 320 });
    }
    if (config.region === 2) s.spawnEnemy('boss', { x: 1100, y: 1000 });
    const methods = ['update', 'publishHud', 'drawBars', 'updateEnemies', 'updateObjects', 'saveSnapshot'];
    const timings = Object.fromEntries(methods.map(name => [name, []]));
    const originals = {};
    const sceneUpdate = s.sys.sceneUpdate;
    for (const name of methods) {
      originals[name] = s[name];
      s[name] = function (...args) { const t = performance.now(); const result = originals[name].apply(this, args);
        timings[name].push(performance.now() - t); return result; };
    }
    s.sys.sceneUpdate = s.update;
    const render = game.renderer.render;
    const renders = [];
    game.renderer.render = function (...args) { const t = performance.now(); const result = render.apply(this, args);
      renders.push(performance.now() - t); return result; };
    const observer = new MutationObserver(() => {});
    observer.observe(document.querySelector('#stats'), { childList: true, subtree: true });
    const frames = [];
    for (let i = 0; i < 600; i++) {
      if (s.choosing) s.chooseUpgrade(s.upgradeOptions[0]);
      const t = performance.now(); game.step(i * 1000 / 60, 1000 / 60); frames.push(performance.now() - t);
    }
    s.saveSnapshot();
    const snapshot = JSON.parse(localStorage.getItem('grovebound-run-v1'));
    results.push({ ...config, frames: sample(frames), render: sample(renders),
      methods: Object.fromEntries(methods.map(name => [name, sample(timings[name])])),
      statsMutations: observer.takeRecords().length, snapshot });
    observer.disconnect();
    for (const name of methods) s[name] = originals[name];
    s.sys.sceneUpdate = sceneUpdate;
    game.renderer.render = render;
  }
  return { renderer: game.renderer.type, userAgent: navigator.userAgent, results };
});
const output = { ...results, errors, note: 'Desktop Chrome, 390x844. 600 fixed 60Hz steps per seeded scenario including real Phaser rendering; CPU timings are not Android FPS or GPU completion timings.' };
await writeFile(outputPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify(output.results.map(({ name, frames, render, methods, statsMutations }) => ({ name, frames, render, methods, statsMutations })), null, 2));
await browser.close();
if (budgetMode) {
  let breached = errors.length > 0;
  for (const e of errors) console.log('page error: ' + e);
  console.log('Budget (desktop CPU ms per frame, not Android FPS), scale ' + budgetScale);
  for (const r of output.results) {
    const b = BUDGETS[r.seed];
    const checks = [['median', r.frames.medianMs, b.median * budgetScale], ['p95', r.frames.p95Ms, b.p95 * budgetScale]];
    for (const [label, got, limit] of checks) {
      const ok = got <= limit; if (!ok) breached = true;
      console.log('  seed ' + r.seed + ' ' + r.name + ' ' + label + ': ' + got.toFixed(2) + ' ms vs budget ' + limit.toFixed(2) + ' ms ' + (ok ? 'PASS' : 'FAIL'));
    }
  }
  if (breached) { console.error('Performance budget breached'); process.exitCode = 1; }
}
