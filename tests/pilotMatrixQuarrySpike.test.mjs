import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { damageSourceSection } from '../scripts/pilot-matrix.mjs';
import { fixtureRows } from './pilotMatrixFixture.mjs';

const NL = String.fromCharCode(10);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('pilot-matrix --skill with --focus restore', () => {
  it('is rejected before any server or browser starts', () => {
    // A missing --baseline file would fail later with ENOENT; the guard must fire first, so nothing launches either way.
    const run = spawnSync(process.execPath, ['scripts/pilot-matrix.mjs', '--commands', 'on', '--focus', 'restore',
      '--skill', '250', '--baseline', 'reports/pilot-matrix/does-not-exist.json'], { cwd: root, encoding: 'utf8', timeout: 30_000 });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('--skill cannot be combined with --focus restore');
    // The child loads playwright and vite before its argument check (11-35 s on a loaded machine), so the test
    // gets the same budget as the child instead of vitest's 5 s default.
  }, 35_000);
});

// Events are [run seconds, region, source, hp lost, wisps alive, surge 0/1], as runCell writes them with --trace.
const traced = [
  { ...fixtureRows[0], id: 'a+off', cell: 'a', arm: 'off', quarry: 'coolantRun', damageTaken: 60,
    damageEvents: [[100, 0, 'melee:brute', 10, 0, 0], [310, 1, 'lance', 20, 4, 0], [350, 1, 'melee:wisp', 10, 9, 1], [370, 1, 'vent', 16, 8, 1], [500, 2, 'boss', 4, 0, 0]],
    windowSamples: [[300, 4, 20, 0], [360, 9, 40, 1]],
    quarryExposure: { on: { seconds: 60, wispSeconds: 480 }, off: { seconds: 150, wispSeconds: 300 } } },
  { ...fixtureRows[2], id: 'c+off', cell: 'c', arm: 'off', quarry: 'forgeAssault', damageTaken: 45, outcome: 'loss (region 2)', won: false,
    damageEvents: [[305, 1, 'charge', 25, 2, 0], [389, 1, 'melee:wisp', 20, 12, 1]], windowSamples: [[300, 2, 18, 0], [380, 12, 50, 1]],
    quarryExposure: { on: { seconds: 40, wispSeconds: 520 }, off: { seconds: 150, wispSeconds: 200 } } },
];

describe('pilot-matrix damage by source (Quarry 5:00-6:30)', () => {
  it('is empty when no row carries a damage trace', () => {
    expect(damageSourceSection(fixtureRows)).toEqual([]);
  });

  it('tables window damage by source, 30 s bucket, route, surge and killing blow', () => {
    const text = damageSourceSection(traced).join(NL);
    expect(text).toContain('## Damage taken by source, Ember Quarry 5:00–6:30');
    // Per arm, mean hp lost per run in the window: lance 10, charge 12.5, vent 8, melee 15 (10 + 20) / 2; total 45.5.
    expect(text).toContain('| off | 2 | 1 | 10.0 | 12.5 | 8.0 | 15.0 | 0.0 | 45.5 | 87% | 0 |');
    // Bucket 6:00-6:30 holds the vent hit and the 6:29 wisp hit: (16 + 20) / 2 runs; wisp samples 9 and 12.
    expect(text).toContain('| off | 6:00–6:30 | 0.0 | 0.0 | 8.0 | 10.0 | 0.0 | 18.0 | 10.5 |');
    expect(text).toContain('| off | 5:00–5:30 | 10.0 | 12.5 | 0.0 | 0.0 | 0.0 | 22.5 | 3.0 |');
    expect(text).toContain('| off | forgeAssault | 1 | 1 | 0.0 | 25.0 | 0.0 | 20.0 | 0.0 | 45.0 |');
    expect(text).toContain('| off | wisp | 15.0 |');
    // Quarry-wide (region index 1 only; the 1:40 Verge and 8:20 boss hits are out). Surge on: 16 + 10 + 20 = 46 hp over
    // 100 s, 1000 wisp-seconds; off: 20 + 25 = 45 hp over 300 s, 500 wisp-seconds.
    expect(text).toContain('| off | surge on | 50.0 | 10.0 | 23.0 | 0.46 |');
    expect(text).toContain('| off | surge off | 150.0 | 1.7 | 22.5 | 0.15 |');
    expect(text).toContain('| off | 1 | melee:wisp 1 |');
  });

  it('counts damage the trace did not attribute', () => {
    const short = [{ ...traced[0], damageTaken: 70 }];
    expect(damageSourceSection(short).join(NL)).toContain('| off | 1 | 0 | 20.0 | 0.0 | 16.0 | 10.0 | 0.0 | 46.0 | 66% | 10 |');
  });
});
