import { describe, expect, it } from 'vitest';
import { BASE_STATS, EMPTY_PROGRESS, addRunToProgress, damageAfterDefense, seedsForRun, unlockThorns, upgradeStat, xpToNextLevel } from '../src/game/logic';

describe('run progression', () => {
  it('makes each stat pickup meaningful and caps damage reduction', () => {
    expect(upgradeStat(BASE_STATS, 'speed').speed).toBeGreaterThan(BASE_STATS.speed);
    expect(upgradeStat(BASE_STATS, 'regen').regen).toBeGreaterThan(BASE_STATS.regen);
    expect(upgradeStat(BASE_STATS, 'attack').attack).toBeGreaterThan(BASE_STATS.attack);
    let stats = BASE_STATS;
    for (let i = 0; i < 20; i++) stats = upgradeStat(stats, 'defense');
    expect(stats.defense).toBe(0.6);
    expect(damageAfterDefense(10, stats.defense)).toBe(4);
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
});
