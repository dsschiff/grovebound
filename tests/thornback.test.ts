import { describe, expect, it } from 'vitest';
import { advanceThornbackDash, thornbackTarget, THORNBACK_WINDUP } from '../src/game/thornback';

describe('Thornback charge', () => {
  it('locks a bounded lane past the hero so a perpendicular dodge clears it', () => {
    const target = thornbackTarget({ x: 600, y: 900 }, { x: 800, y: 900 });
    expect(target).toEqual({ x: 895, y: 900 });
    expect(thornbackTarget({ x: 1740, y: 900 }, { x: 1800, y: 900 }).x).toBe(1755);
    expect(190 * THORNBACK_WINDUP).toBeGreaterThan(45);
  });

  it('dashes along the locked lane at a fixed speed and ends exactly at the target', () => {
    const state = { cooldown: 0, windup: 0, dashRemaining: 1,
      fromX: 600, fromY: 900, toX: 900, toY: 900, hit: false };
    const step = advanceThornbackDash(state, 0.1);
    expect(step.point.x).toBeCloseTo(653);
    expect(step.finished).toBe(false);
    const end = advanceThornbackDash({ ...state, dashRemaining: step.remaining }, 1);
    expect(end).toEqual({ remaining: 0, point: { x: 900, y: 900 }, finished: true });
  });
});
