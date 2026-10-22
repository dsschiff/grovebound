import { describe, expect, it } from 'vitest';
import { routeSection, summarize } from '../scripts/pilot-matrix.mjs';

const row = (id, quarry, moon, extra = {}) => ({
  id, cell: id, run: 1, seedSet: 'A', hero: 'warden', contract: 'waylight', quarry, moon, seed: 101,
  outcome: 'win', won: true, gameSeconds: 630, damageTaken: 100, kills: 50, regionSeconds: [200, 200, 230],
  minHealthFraction: 0.5, minHealthFractionHp: 50, minHealthFractionMaxHp: 100, minHealthFractionAtSeconds: 300,
  softlock: false, maxStallSeconds: 0, forks: [{ natural: true }], routesMatch: true,
  chosenRoutes: { quarry, moon }, ...extra,
});

const fixture = [
  row('a', 'coolantRun', 'moonflame', { gameSeconds: 600, damageTaken: 100, minHealthFraction: 0.4 }),
  row('b', 'coolantRun', 'altarRite', { gameSeconds: 660, damageTaken: 200, minHealthFraction: 0.2 }),
  // Lost in the Quarry: never reached the Moonfen fork.
  row('c', 'forgeAssault', 'moonflame', { outcome: 'loss (region 2)', won: false, gameSeconds: 300, damageTaken: 301, minHealthFraction: 0.05, chosenRoutes: { quarry: 'forgeAssault', moon: null } }),
];

describe('pilot-matrix Per route table', () => {
  it('summarizes runs, wins, mean clock, mean damage taken and lowest HP per route', () => {
    expect(routeSection(fixture).join('\n')).toBe([
      '', '## Per route', '',
      'Runs that took each route (a run counts under its Quarry and its Moonfen route). Clock and damage taken are whole-run means.', '',
      '| Route | Runs | Wins | Mean clock | Mean damage taken | Lowest HP % |', '|---|---|---|---|---|---|',
      '| Moonfen/altarRite | 1 | 1 | 11:00 | 200 | 20% |',
      '| Moonfen/moonflame | 1 | 1 | 10:00 | 100 | 40% |',
      '| Quarry/coolantRun | 2 | 2 | 10:30 | 150 | 20% |',
      '| Quarry/forgeAssault | 1 | 0 | 5:00 | 301 | 5% |',
    ].join('\n'));
  });

  it('is empty without rows, and rows without chosenRoutes fall back to the assigned route', () => {
    expect(routeSection([])).toEqual([]);
    const old = { ...row('d', 'coolantRun', 'moonflame') }; delete old.chosenRoutes;
    expect(routeSection([old]).join('\n')).toContain('| Moonfen/moonflame | 1 | 1 | 10:30 | 100 | 50% |');
  });

  it('adds the table to the summary after Per hero and leaves the rest unchanged', () => {
    const text = summarize({ cells: Object.fromEntries(fixture.map(r => [r.id, r])) });
    expect(text.indexOf('## Per hero')).toBeLessThan(text.indexOf('## Per route'));
    const without = text.replace(/\n## Per route[\s\S]*?(?=\n\n|$)/, '');
    expect(without).not.toContain('## Per route');
    expect(without).toContain('| warden | 3 | 2 |');
  });
});
