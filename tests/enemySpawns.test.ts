import { describe, expect, it } from 'vitest';
import { ENEMY_STATS, MAX_THORNBACKS, enemyKindForRoll, enemyMaxHp, spawnDistance, wavePaused } from '../src/game/enemySpawns';

describe('enemy kind selection', () => {
  it('spawns only gnarls in the first 25 seconds of a stage', () => {
    for (const roll of [0, 0.1, 0.49, 0.99]) for (const region of [0, 1, 2]) {
      expect(enemyKindForRoll(roll, region, 25, true, 0)).toBe('gnarl');
    }
  });

  it('unlocks wisps, then thornbacks, then brutes as the stage runs on', () => {
    expect(enemyKindForRoll(0.05, 0, 30, false, 0)).toBe('wisp');
    expect(enemyKindForRoll(0.05, 0, 41, false, 0)).toBe('thornback');
    expect(enemyKindForRoll(0.2, 0, 41, false, 0)).toBe('wisp');
    expect(enemyKindForRoll(0.2, 0, 56, false, 0)).toBe('brute');
    expect(enemyKindForRoll(0.6, 0, 56, false, 0)).toBe('gnarl');
  });

  it('caps roaming thornbacks and falls through to the next band', () => {
    expect(enemyKindForRoll(0.05, 0, 60, false, MAX_THORNBACKS - 1)).toBe('thornback');
    expect(enemyKindForRoll(0.05, 0, 60, false, MAX_THORNBACKS)).toBe('brute');
  });

  it('widens bands by region and lets a surge add wisps', () => {
    expect(enemyKindForRoll(0.14, 1, 60, false, 0)).toBe('thornback');
    expect(enemyKindForRoll(0.14, 0, 60, false, 0)).toBe('brute');
    expect(enemyKindForRoll(0.54, 0, 30, false, 0)).toBe('gnarl');
    expect(enemyKindForRoll(0.54, 0, 30, true, 0)).toBe('wisp');
    expect(enemyKindForRoll(0.54, 1, 30, false, 0)).toBe('wisp');
    expect(enemyKindForRoll(0.55, 1, 30, false, 0)).toBe('gnarl');
  });
});

describe('spawn pacing and scaling', () => {
  it('rests waves for the last 7 seconds of every 45 unless a surge is on', () => {
    expect(wavePaused(false, 38)).toBe(false);
    expect(wavePaused(false, 38.5)).toBe(true);
    expect(wavePaused(false, 44.9)).toBe(true);
    expect(wavePaused(false, 45)).toBe(false);
    expect(wavePaused(false, 83.5)).toBe(true);
    expect(wavePaused(true, 40)).toBe(false);
  });

  it('spawns thornbacks closer than other wave enemies', () => {
    expect(spawnDistance('thornback')).toBe(280);
    expect(spawnDistance('gnarl')).toBe(430);
    expect(spawnDistance('wisp')).toBe(430);
  });

  it('scales wave enemy hp by region and stage time but not guardians', () => {
    expect(enemyMaxHp('gnarl', 0, 0)).toBe(27);
    expect(enemyMaxHp('gnarl', 2, 70)).toBe(Math.round(27 * 1.6));
    expect(enemyMaxHp('brute', 1, 140)).toBe(Math.round(82 * 1.45));
    expect(enemyMaxHp('gatekeeper', 1, 200)).toBe(ENEMY_STATS.gatekeeper.hp);
    expect(enemyMaxHp('boss', 2, 200)).toBe(ENEMY_STATS.boss.hp);
  });
});
