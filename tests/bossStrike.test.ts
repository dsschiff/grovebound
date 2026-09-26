import { describe, expect, it } from 'vitest';
import { BOSS_STRIKE_WINDUP, bossStrikeCooldown, bossStrikeRadius, bossStrikeTarget, insideBossStrike } from '../src/game/bossStrike';

describe('Briar King strike', () => {
  it('marks ahead of the current movement and stays inside the arena', () => {
    expect(bossStrikeTarget({ x: 900, y: 900 }, { x: 1, y: 0 })).toEqual({ x: 1050, y: 900 });
    expect(bossStrikeTarget({ x: 900, y: 900 }, { x: 0, y: 0 })).toEqual({ x: 900, y: 900 });
    expect(bossStrikeTarget({ x: 1740, y: 42 }, { x: 1, y: -1 })).toEqual({ x: 1758, y: 42 });
  });

  it('gives time and space to dodge while escalating with phases', () => {
    expect(BOSS_STRIKE_WINDUP).toBeGreaterThan(1);
    expect(bossStrikeRadius(0)).toBe(95);
    expect(bossStrikeRadius(3)).toBe(140);
    expect(bossStrikeCooldown(3)).toBeLessThan(bossStrikeCooldown(0));
    const strike = { cooldown: 0, windup: 0.5, x: 500, y: 500, radius: 95 };
    expect(insideBossStrike({ x: 550, y: 500 }, strike)).toBe(true);
    expect(insideBossStrike({ x: 600, y: 500 }, strike)).toBe(false);
  });
});
