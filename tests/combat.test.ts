import { describe, expect, it } from 'vitest';
import { bossPhaseFor, chooseAutoTarget, pickUpgradeChoices, shouldSpawnGuardian, weaponDamage, weaponSplash } from '../src/game/combat';
import { BASE_STATS, Rng } from '../src/game/logic';

describe('combat and objective rules', () => {
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
  });
});
