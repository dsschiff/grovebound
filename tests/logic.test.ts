import { describe, expect, it, vi } from 'vitest';
import {
  BASE_STATS, EMPTY_PROGRESS, LEGACY_SAVE_KEY, SAVE_KEY, Rng, addRunToProgress, availableHero, damageAfterDefense,
  generateRegionLayout, masteryRank, parseProgress, readProgress, seedsForRun, unlockThorns, upgradeStat, xpToNextLevel,
} from '../src/game/logic';
import { emptyRunMetrics, parseRunSnapshot, type RunSnapshot } from '../src/game/runSave';

describe('run progression', () => {
  it('makes each stat pickup meaningful and caps damage reduction', () => {
    expect(upgradeStat(BASE_STATS, 'speed').speed).toBeGreaterThan(BASE_STATS.speed);
    expect(upgradeStat(BASE_STATS, 'regen').regen).toBeGreaterThan(BASE_STATS.regen);
    expect(upgradeStat(BASE_STATS, 'attack').attack).toBeGreaterThan(BASE_STATS.attack);
    expect(upgradeStat(BASE_STATS, 'maxHealth').maxHealth).toBe(120);
    expect(upgradeStat(BASE_STATS, 'reach').reach).toBe(1.12);
    let stats = BASE_STATS;
    for (let i = 0; i < 20; i++) stats = upgradeStat(stats, 'defense');
    expect(stats.defense).toBe(0.6);
    expect(damageAfterDefense(10, stats.defense)).toBe(4);
    for (let i = 0; i < 20; i++) stats = upgradeStat(stats, 'reach');
    expect(stats.reach).toBe(1.8);
  });

  it('raises experience requirements and awards seeds for completed runs', () => {
    expect(xpToNextLevel(2)).toBeGreaterThan(xpToNextLevel(1));
    expect(seedsForRun(70, true)).toBeGreaterThan(seedsForRun(70, false));
    const progress = addRunToProgress(EMPTY_PROGRESS, 70, 312, true);
    expect(progress.victories).toBe(1);
    expect(progress.bestKills).toBe(70);
    expect(progress.seeds).toBe(seedsForRun(70, true));
    expect(unlockThorns(progress).thornsUnlocked).toBe(true);
  });

  it('migrates old progress without losing seeds or the paid weapon', () => {
    const migrated = parseProgress({ seeds: 9, thornsUnlocked: true, bestKills: 70, bestSeconds: 312, victories: 1 });
    expect(migrated.seeds).toBe(9);
    expect(migrated.thornsUnlocked).toBe(true);
    expect(migrated.bestRegion).toBe(0);
    expect(migrated.mastery.warden).toBe(0);
    const earned = addRunToProgress(migrated, 40, 200, false, 'warden', 1);
    expect(availableHero(earned, 'ranger')).toBe(true);
    expect(masteryRank(earned.mastery.warden)).toBeGreaterThan(0);
  });

  it('writes the migrated v2 save when only a v1 browser save exists', () => {
    const values = new Map([[LEGACY_SAVE_KEY, JSON.stringify({ seeds: 11, thornsUnlocked: true, bestKills: 20 })]]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    try {
      const progress = readProgress();
      expect(progress.seeds).toBe(11);
      expect(progress.thornsUnlocked).toBe(true);
      expect(JSON.parse(values.get(SAVE_KEY)!)).toEqual(progress);
    } finally { vi.unstubAllGlobals(); }
  });

  it('assembles repeatable connected clearings in each region', () => {
    const first = generateRegionLayout(12345, 1);
    expect(generateRegionLayout(12345, 1)).toEqual(first);
    expect(generateRegionLayout(12345, 2)).not.toEqual(first);
    expect(first.clearings.map(clearing => clearing.kind)).toEqual(['start', 'ward', 'ward', 'shrine', 'gate']);
    for (const clearing of first.clearings) {
      expect(clearing.x).toBeGreaterThan(clearing.radius);
      expect(clearing.x).toBeLessThan(1800 - clearing.radius);
      expect(clearing.y).toBeGreaterThan(clearing.radius);
      expect(clearing.y).toBeLessThan(1800 - clearing.radius);
      expect(Math.hypot(clearing.x - 900, clearing.y - 900)).toBeLessThan(900);
    }
    const rng = new Rng(77);
    expect(new Rng(77).next()).toBe(rng.next());
  });

  it('restores a complete run snapshot and rejects damaged state', () => {
    const snapshot: RunSnapshot = {
      version: 1, seed: 88, rngState: 44, hero: 'warden', skin: false,
      unlockedWeapons: ['axe'], masteryRank: 0, weapons: [{ id: 'axe', rank: 1, cooldown: 0.3 }],
      weaponSlots: 1, splashBonus: 0, pet: false, petClock: 0,
      autoSpecial: false, specialCooldown: 0, reducedEffects: false,
      stats: { ...BASE_STATS }, health: 62, xp: 3, level: 4, kills: 23,
      seconds: 70, region: 0, stageSeconds: 70, spawnClock: 0.2, cacheClock: 3,
      x: 840, y: 930, invulnerability: 0,
      gatekeeperSpawned: false, bossSpawned: false, choosing: false, upgradeOptions: [],
      enemies: [{ kind: 'gnarl', x: 930, y: 920, hp: 12, maxHp: 27, phase: 2 }],
      objects: [{ kind: 'ward', x: 500, y: 500, hp: 90, maxHp: 150, active: true }],
      orbs: [{ x: 825, y: 900, value: 1 }], caches: [{ x: 850, y: 840, stat: 'attack' }],
      metrics: { ...emptyRunMetrics(), foeDamage: 120, caches: 2, regionSeconds: [70, null, null] },
    };
    expect(parseRunSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    const { metrics: _legacyMetrics, ...legacy } = snapshot;
    expect(parseRunSnapshot(legacy)?.metrics).toEqual(emptyRunMetrics());
    expect(parseRunSnapshot({ ...snapshot, metrics: { ...snapshot.metrics, foeDamage: -1 } })).toBeNull();
    expect(parseRunSnapshot({ ...snapshot, health: 1000 })).toBeNull();
    expect(parseRunSnapshot({ ...snapshot, version: 2 })).toBeNull();
  });
});
