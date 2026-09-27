import { describe, expect, it, vi } from 'vitest';
import {
  BASE_STATS, EMPTY_PROGRESS, LEGACY_SAVE_KEY, SAVE_KEY, Rng, addRunToProgress, availableHero, baseStatsFor, damageAfterDefense,
  generateRegionLayout, masteryRank, parseProgress, readProgress, seedsForRun, unlockThorns, upgradeStat, xpToNextLevel,
} from '../src/game/logic';
import { emptyRunMetrics, parseRunSnapshot, type RunSnapshot } from '../src/game/runSave';

describe('run progression', () => {
  it('makes each stat pickup meaningful and caps damage reduction', () => {
    expect(baseStatsFor('warden').defense).toBeGreaterThan(baseStatsFor('ranger').defense);
    expect(baseStatsFor('warden').maxHealth).toBeGreaterThan(baseStatsFor('ember').maxHealth);
    expect(baseStatsFor('ranger').speed).toBeGreaterThan(baseStatsFor('warden').speed);
    expect(baseStatsFor('ember').attack).toBeGreaterThan(baseStatsFor('warden').attack);
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
    const loadout = { ...snapshot, weapons: [{ id: 'axe' as const, rank: 1, cooldown: 0.3 },
      { id: 'bow' as const, rank: 2, cooldown: 0.1 }], weaponSlots: 2, focusedWeapon: 'bow' as const };
    expect(parseRunSnapshot(loadout)?.focusedWeapon).toBe('bow');
    expect(parseRunSnapshot({ ...loadout, focusedWeapon: 'staff' })).toBeNull();
    const { metrics: _legacyMetrics, ...legacy } = snapshot;
    expect(parseRunSnapshot(legacy)?.metrics).toEqual(emptyRunMetrics());
    const burning = { ...snapshot, enemies: [{ ...snapshot.enemies[0], burnRemaining: 2.5, burnTickClock: 0.4, burnDamage: 6 }] };
    expect(parseRunSnapshot(burning)?.enemies[0].burnRemaining).toBe(2.5);
    const creditedBurn = { ...snapshot, enemies: [{ ...burning.enemies[0], burnSource: 'staff' as const }] };
    expect(parseRunSnapshot(creditedBurn)?.enemies[0].burnSource).toBe('staff');
    expect(parseRunSnapshot({ ...creditedBurn, enemies: [{ ...creditedBurn.enemies[0], burnSource: 'poison' }] })).toBeNull();
    expect(parseRunSnapshot({ ...burning, enemies: [{ ...burning.enemies[0], burnDamage: -4 }] })).toBeNull();
    const boss = { ...snapshot, enemies: [{ kind: 'boss' as const, x: 900, y: 800, hp: 600, maxHp: 1150,
      phase: 2, bossStrike: { cooldown: 0, windup: 0.7, x: 930, y: 920, radius: 125 } }] };
    expect(parseRunSnapshot(boss)?.enemies[0].bossStrike?.windup).toBe(0.7);
    expect(parseRunSnapshot({ ...boss, enemies: [{ ...boss.enemies[0], bossStrike: undefined }] })?.enemies[0].bossStrike).toBeUndefined();
    expect(parseRunSnapshot({ ...boss, enemies: [{ ...boss.enemies[0], bossStrike: { ...boss.enemies[0].bossStrike, windup: -1 } }] })).toBeNull();
    const lancing = { ...snapshot, region: 1, enemies: [{ kind: 'wisp' as const, x: 640, y: 900,
      hp: 17, maxHp: 17, phase: 2, wispLance: { cooldown: 0, windup: 0.6,
        fromX: 640, fromY: 900, toX: 900, toY: 900 } }] };
    expect(parseRunSnapshot(lancing)?.enemies[0].wispLance?.windup).toBe(0.6);
    expect(parseRunSnapshot({ ...lancing, enemies: [{ ...lancing.enemies[0],
      wispLance: { ...lancing.enemies[0].wispLance, windup: -1 } }] })).toBeNull();
    expect(parseRunSnapshot({ ...lancing, enemies: [{ ...lancing.enemies[0], kind: 'gnarl' }] })).toBeNull();
    const terrainTactic = { ...snapshot, region: 1, moonflowRemaining: 4.5, markedFieldIndex: 1,
      enemies: [{ ...snapshot.enemies[0], tangleRemaining: 2.2 }],
      objects: [...snapshot.objects, { kind: 'ore' as const, x: 750, y: 900, hp: 90, maxHp: 200, active: true }] };
    expect(parseRunSnapshot(terrainTactic)?.markedFieldIndex).toBe(1);
    expect(parseRunSnapshot(terrainTactic)?.enemies[0].tangleRemaining).toBe(2.2);
    expect(parseRunSnapshot({ ...terrainTactic, moonflowRemaining: -1 })).toBeNull();
    expect(parseRunSnapshot({ ...terrainTactic, enemies: [{ ...terrainTactic.enemies[0], tangleRemaining: 20 }] })).toBeNull();
    const { hazards: _oldHazards, ...oldMetrics } = snapshot.metrics;
    expect(parseRunSnapshot({ ...snapshot, metrics: oldMetrics })?.metrics.hazards).toBe(0);
    const withHazards = { ...snapshot, objects: [{ kind: 'vent', x: 850, y: 780, hp: 20, maxHp: 180, active: true }],
      metrics: { ...snapshot.metrics, hazards: 2 } };
    expect(parseRunSnapshot(withHazards)?.metrics.hazards).toBe(2);
    const newObjective = { ...snapshot, region: 1, objects: [{ kind: 'pump', x: 850, y: 780, hp: 20, maxHp: 240, active: true },
      { kind: 'forge', x: 1100, y: 950, hp: 320, maxHp: 320, active: false }] };
    expect(parseRunSnapshot(newObjective)?.objects[1].kind).toBe('forge');
    const escorted = { ...snapshot, waylightAmbush: true,
      objects: [{ kind: 'waylight', x: 640, y: 760, hp: 1, maxHp: 1, active: true }] };
    expect(parseRunSnapshot(escorted)?.objects[0].x).toBe(640);
    expect(parseRunSnapshot({ ...escorted, waylightAmbush: 'yes' })).toBeNull();
    const ritual = { ...snapshot, region: 2, ritualClock: 3.4,
      objects: [{ kind: 'altar', x: 640, y: 760, hp: 4, maxHp: 6, active: true }] };
    expect(parseRunSnapshot(ritual)?.ritualClock).toBe(3.4);
    expect(parseRunSnapshot({ ...ritual, ritualClock: -1 })).toBeNull();
    const { terrain: _oldTerrain, ...priorMetrics } = snapshot.metrics;
    expect(parseRunSnapshot({ ...snapshot, metrics: priorMetrics })?.metrics.terrain).toBe(0);
    const { weaponDamage: _oldWeaponDamage, ...preWeaponMetrics } = snapshot.metrics;
    expect(parseRunSnapshot({ ...snapshot, metrics: preWeaponMetrics })?.metrics.weaponDamage).toEqual(emptyRunMetrics().weaponDamage);
    expect(parseRunSnapshot({ ...snapshot, metrics: { ...snapshot.metrics, weaponDamage: { axe: -1, thorns: 0, bow: 0, staff: 0 } } })).toBeNull();
    const { lancesEvaded: _oldEvades, lanceHits: _oldLanceHits, ...preLanceMetrics } = snapshot.metrics;
    expect(parseRunSnapshot({ ...snapshot, metrics: preLanceMetrics })?.metrics.lancesEvaded).toBe(0);
    const terrainRun = { ...snapshot, region: 1, objects: [{ kind: 'ore', x: 850, y: 780, hp: 100, maxHp: 200, active: true }],
      metrics: { ...snapshot.metrics, terrain: 1 } };
    expect(parseRunSnapshot(terrainRun)?.metrics.terrain).toBe(1);
    expect(parseRunSnapshot({ ...terrainRun, metrics: { ...terrainRun.metrics, terrain: 7 } })).toBeNull();
    expect(parseRunSnapshot({ ...withHazards, metrics: { ...withHazards.metrics, hazards: -1 } })).toBeNull();
    expect(parseRunSnapshot({ ...snapshot, metrics: { ...snapshot.metrics, foeDamage: -1 } })).toBeNull();
    expect(parseRunSnapshot({ ...snapshot, health: 1000 })).toBeNull();
    expect(parseRunSnapshot({ ...snapshot, version: 2 })).toBeNull();
  });
});
