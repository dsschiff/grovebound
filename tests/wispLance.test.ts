import { describe, expect, it } from 'vitest';
import { insideWispLance, waveInterval, wildSurge, wispLanceCooldown, wispLanceDamage,
  wispLanceTarget, WISP_LANCE_WINDUP } from '../src/game/wispLance';

describe('wisp lance and wild surge', () => {
  it('leads movement but allows a perpendicular dodge', () => {
    const target = wispLanceTarget({ x: 800, y: 800 }, { x: 1, y: 0 }, 200);
    expect(target.x).toBeGreaterThan(900);
    const lance = { cooldown: 0, windup: WISP_LANCE_WINDUP, fromX: 500, fromY: 800,
      toX: target.x, toY: target.y };
    expect(insideWispLance({ x: 830, y: 800 }, lance)).toBe(true);
    expect(insideWispLance({ x: 830, y: 850 }, lance)).toBe(false);
    expect(insideWispLance({ x: 400, y: 800 }, lance)).toBe(false);
    expect(wispLanceTarget({ x: 1740, y: 1740 }, { x: 1, y: 1 }, 300))
      .toEqual({ x: 1758, y: 1758 });
  });

  it('raises late-region pressure and leaves Verge introductory', () => {
    expect(wildSurge(0, 175, 175)).toBe(false);
    expect(wildSurge(1, 100, 205)).toBe(false);
    expect(wildSurge(1, 120, 205)).toBe(true);
    expect(wildSurge(2, 120, 235)).toBe(true);
    expect(waveInterval(2, 150, true)).toBeLessThan(waveInterval(2, 150, false));
    expect(wispLanceCooldown(2, 180)).toBeLessThan(wispLanceCooldown(1, 20));
    expect(wispLanceDamage(2, 200)).toBeGreaterThan(wispLanceDamage(1, 20));
  });
});
