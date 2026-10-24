// Pre-push gate, run by .githooks/pre-push: the frame-time budget check plus a one-cell pilot-matrix smoke run.
// Starts its own Vite dev server on 5173 or the next free port above it, so nothing needs to be running first.
// Skip once with GROVE_SKIP_PREPUSH=1 (the hook prints how). Needs desktop Chrome or PLAYWRIGHT_CHANNEL=chromium.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const started = Date.now();
const secs = () => ((Date.now() - started) / 1000).toFixed(1) + 's';

function run(label, scriptArgs, env = {}, keep = null) {
  return new Promise(resolveRun => {
    console.log(`[pre-push] ${label} ...`);
    const child = spawn(process.execPath, scriptArgs, { cwd: root, stdio: ['ignore', keep ? 'pipe' : 'inherit', 'inherit'], windowsHide: true, env: { ...process.env, ...env } });
    // The profiler prints its full JSON report; keep only the lines that matter here.
    child.stdout?.on('data', chunk => String(chunk).split('\n').filter(line => keep.test(line)).forEach(line => console.log(line.trimEnd())));
    child.on('error', error => { console.error(`[pre-push] ${label}: ${error.message}`); resolveRun(1); });
    child.on('exit', code => { console.log(`[pre-push] ${label}: ${code === 0 ? 'ok' : 'FAILED (exit ' + code + ')'} at ${secs()}`); resolveRun(code ?? 1); });
  });
}

const work = await mkdtemp(join(tmpdir(), 'grovebound-prepush-'));
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
let failed = false;
try {
  await server.listen();
  const port = server.httpServer.address().port;
  const url = `http://127.0.0.1:${port}/`;
  // 1. Budget: same check as `npm run profile:budget`, pointed at this server. Exits nonzero on a breach.
  //    Timings are CPU ms and noisy on a busy machine, so one breach is retried once; two in a row fail the push.
  const budget = () => run('frame budget', ['scripts/profile-browser.mjs', '--budget', join(work, 'profile.json')], { GROVE_URL: url + '?seed=24' }, /^(Budget|  seed|Performance budget)/);
  if (await budget() && (console.log('[pre-push] budget breached; retrying once'), await budget())) failed = true;
  // 2. Smoke: one pilot-matrix cell (warden, first contract/routes) from a clean output file. The matrix itself reports no
  //    pass/fail on outcomes, so this only proves the pilot plays a full run without throwing or hanging.
  if (!failed && await run('pilot-matrix smoke', ['scripts/pilot-matrix.mjs', '--limit', '1', '--heroes', 'warden', '--concurrency', '1',
    '--out', join(work, 'pilot-matrix.json'), '--port', '0'])) failed = true;
} finally {
  await server.close();
  await rm(work, { recursive: true, force: true });
}
console.log(`[pre-push] ${failed ? 'FAILED' : 'passed'} in ${secs()}`);
process.exit(failed ? 1 : 0);
