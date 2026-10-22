// Rows shaped the way runCell in scripts/pilot-matrix.mjs writes them: chosenRoutes always holds both routes (GroveScene
// seeds them at run start, so a run lost early still has a non-null moon route), and endRegion is the region it ended in.
const row = (id, hero, quarry, moon, extra = {}) => ({
  id, cell: id, run: 1, seedSet: 'A', hero, contract: 'waylight', quarry, moon, seed: 101,
  outcome: 'win', won: true, gameSeconds: 630, endRegion: 2, damageTaken: 100, foeDamage: 90, kills: 50, regionSeconds: [200, 200, 230],
  minHealthFraction: 0.5, minHealthFractionHp: 50, minHealthFractionMaxHp: 100, minHealthFractionAtSeconds: 300,
  softlock: false, maxStallSeconds: 0, forks: [{ natural: true }], routesMatch: true,
  chosenRoutes: { quarry, moon }, ...extra,
});

export const fixtureRows = [
  row('a', 'warden', 'coolantRun', 'moonflame', { gameSeconds: 600, damageTaken: 100, minHealthFraction: 0.4 }),
  row('b', 'ranger', 'coolantRun', 'altarRite', { gameSeconds: 660, damageTaken: 200, minHealthFraction: 0.2 }),
  // Lost in the Quarry (endRegion 1): reached the Quarry route, never the Moonfen fork, but the seeded moon route is set.
  row('c', 'warden', 'forgeAssault', 'altarRite', { outcome: 'loss (region 2)', won: false, gameSeconds: 300, endRegion: 1, damageTaken: 301, minHealthFraction: 0.05 }),
  // Lost before the Quarry fork (endRegion 0): neither route counts.
  row('d', 'ember', 'forgeAssault', 'altarRite', { outcome: 'loss (region 1)', won: false, gameSeconds: 100, endRegion: 0, damageTaken: 400, minHealthFraction: 0.01 }),
];
