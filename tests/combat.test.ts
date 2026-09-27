import { describe, expect, it } from 'vitest';
import { advanceEmberField, bossPhaseFor, bowCriticalChance, chooseAutoTarget, pickUpgradeChoices, pierceTarget, pierceTargets, targetsInArc,
  ricochetTarget, shouldSpawnGuardian, staffBurn, thornPierceCount, weaponDamage, weaponPathEffects, weaponSplash } from '../src/game/combat';
import { BASE_STATS, Rng } from '../src/game/logic';

describe('combat and objective rules', () => {
  it('keeps command volleys in the aimed arc and orders hits by distance', () => {
    const origin = { x: 100, y: 100 };
    const enemies = [{ x: 220, y: 105 }, { x: 60, y: 100 }, { x: 170, y: 130 }, { x: 500, y: 100 }];
    expect(targetsInArc(origin, { x: 250, y: 100 }, enemies, 180, 0.7)).toEqual([2, 0]);
    expect(targetsInArc(origin, { x: 250, y: 100 }, enemies, 180, 0.7, 1)).toEqual([2]);
  });
  it('ticks burning ground every half second and preserves its remaining clock', () => {
    expect(advanceEmberField(4, 0.5, 0.2)).toEqual({ remaining: 3.8, tickClock: 0.3, ticks: 0 });
    expect(advanceEmberField(3.8, 0.3, 0.3)).toEqual({ remaining: 3.5, tickClock: 0.5, ticks: 1 });
    expect(advanceEmberField(0.05, 0.05, 0.05)).toEqual({ remaining: 0, tickClock: 0.5, ticks: 1 });
  });
  it('prioritizes nearby enemies, then attackable objects', () => {
    const origin = { x: 0, y: 0 };
    const objects = [{ x: 25, y: 0 }];
    expect(chooseAutoTarget(origin, 100, [{ x: 80, y: 0 }], objects)).toEqual({ kind: 'enemy', index: 0 });
    expect(chooseAutoTarget(origin, 100, [{ x: 130, y: 0 }], objects)).toEqual({ kind: 'object', index: 0 });
    expect(chooseAutoTarget(origin, 20, [], objects)).toBeNull();
  });

  it('keeps splash weapon-specific and increases weapon damage by rank', () => {
    expect(weaponSplash('thorns', 80)).toBe(0);
    expect(weaponSplash('axe', 20)).toBeGreaterThan(weaponSplash('axe', 0));
    expect(weaponDamage(20, 'bow', 2)).toBeGreaterThan(weaponDamage(20, 'bow', 1));
  });

  it('lets thorn darts pierce only an aligned enemy beyond the first target', () => {
    const origin = { x: 0, y: 0 };
    const first = { x: 50, y: 0 };
    const candidates = [{ x: 40, y: 0 }, { x: 92, y: 23 }, { x: 85, y: 25 }, { x: 140, y: 1 }];
    expect(pierceTarget(origin, first, 200, candidates)).toBe(1);
    expect(pierceTarget(origin, first, 80, candidates)).toBeNull();
    expect(pierceTargets(origin, first, 200, candidates, thornPierceCount(3))).toEqual([1, 3]);
  });

  it('makes weapon ranks change attack behavior', () => {
    expect(weaponSplash('axe', 0, 3)).toBeGreaterThan(weaponSplash('axe', 0, 1));
    expect(weaponSplash('staff', 0, 3)).toBeGreaterThan(weaponSplash('staff', 0, 2));
    expect(bowCriticalChance(3)).toBeGreaterThan(bowCriticalChance(1));
    expect(ricochetTarget({ x: 0, y: 0 }, [{ x: 180, y: 0 }, { x: 70, y: 0 }])).toBe(1);
    expect(staffBurn(3, 100)).toEqual({ seconds: 5, tickDamage: 34 });
    expect(staffBurn(3, 100).tickDamage).toBeGreaterThan(staffBurn(1, 100).tickDamage);
  });

  it('gates encounters on both ward completion and elapsed stage time', () => {
    expect(shouldSpawnGuardian(1, 300, 175, false)).toBe(false);
    expect(shouldSpawnGuardian(0, 170, 175, false)).toBe(false);
    expect(shouldSpawnGuardian(0, 175, 175, false)).toBe(true);
    expect(shouldSpawnGuardian(0, 200, 175, true)).toBe(false);
    expect([0.9, 0.7, 0.4, 0.1].map(ratio => bossPhaseFor(1000 * ratio, 1000))).toEqual([0, 1, 2, 3]);
  });

  it('offers only equipped upgrades or weapons that fit available slots', () => {
    const pool = { stats: { ...BASE_STATS }, weapons: [{ id: 'axe' as const, rank: 3 }],
      unlockedWeapons: ['axe' as const, 'thorns' as const], slots: 1, splashBonus: 0,
      pet: false, masteryRank: 0, level: 3 };
    const choices = pickUpgradeChoices(pool, new Rng(123));
    expect(choices).toHaveLength(3);
    expect(choices).not.toContain('weapon:axe');
    expect(choices).not.toContain('weapon:thorns');
    expect(choices).not.toContain('pet');
    const openSlot = { ...pool, slots: 2 };
    expect(pickUpgradeChoices(openSlot, new Rng(123))).toContain('weapon:thorns');
    const building = { ...pool, weapons: [{ id: 'axe' as const, rank: 1 }, { id: 'thorns' as const, rank: 1 }], slots: 2 };
    const rankOptions = pickUpgradeChoices(building, new Rng(123));
    expect(rankOptions).toContain('weapon:axe');
    expect(rankOptions).toContain('weapon:thorns');
    expect(rankOptions.some(choice => !choice.startsWith('weapon:'))).toBe(true);
    const expanding = { ...building, weapons: [{ id: 'axe' as const, rank: 1 }], slots: 2 };
    expect(pickUpgradeChoices(expanding, new Rng(123))).toEqual(expect.arrayContaining(['weapon:axe', 'weapon:thorns']));
  });

  it('offers both techniques together once a weapon reaches rank II, then retires the fork', () => {
    const pool = { stats: { ...BASE_STATS }, weapons: [{ id: 'bow' as const, rank: 2 }],
      unlockedWeapons: ['bow' as const], slots: 1, splashBonus: 0, pet: false, masteryRank: 0, level: 5 };
    const fork = pickUpgradeChoices(pool, new Rng(17));
    expect(fork).toEqual(expect.arrayContaining(['path:bow:a', 'path:bow:b']));
    const chosen = pickUpgradeChoices({ ...pool, weapons: [{ id: 'bow' as const, rank: 2, path: 'a' as const }] }, new Rng(17));
    expect(chosen.some(choice => choice.startsWith('path:'))).toBe(false);
  });

  it('gives crowd and focused techniques different combat effects', () => {
    expect(weaponPathEffects('axe', 'a').splash).toBeGreaterThan(0);
    expect(weaponPathEffects('axe', 'b').eliteMultiplier).toBeGreaterThan(1);
    expect(weaponPathEffects('thorns', 'a').split).toBeGreaterThan(0);
    expect(weaponPathEffects('thorns', 'b').rootSeconds).toBeGreaterThan(0);
    expect(weaponPathEffects('bow', 'a').flareRadius).toBeGreaterThan(0);
    expect(weaponPathEffects('bow', 'b').pierce).toBeGreaterThan(0);
    expect(weaponPathEffects('staff', 'a').burnSeconds).toBeGreaterThan(0);
    expect(weaponPathEffects('staff', 'b').healOnBurnKill).toBeGreaterThan(0);
  });
});
