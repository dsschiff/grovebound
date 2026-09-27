import { describe, expect, it } from 'vitest';
import { advanceBriarStag, stagLeg, strikeBriarStag } from '../src/game/briarStag';

describe('Briar Stag hunt', () => {
  it('requires three distinct damage legs even when one hit exceeds the health pool', () => {
    const first = strikeBriarStag(330, 330, 600);
    expect(first).toEqual({ hp: 220, leap: 1, dealt: 110 });
    const second = strikeBriarStag(first.hp, 330, 600);
    expect(second).toEqual({ hp: 110, leap: 2, dealt: 110 });
    const third = strikeBriarStag(second.hp, 330, 600);
    expect(third).toEqual({ hp: 0, leap: null, dealt: 110 });
    expect(stagLeg(third.hp, 330)).toBe(3);
  });

  it('orbits its clearing, flees at close range, and remains inside its hunt radius', () => {
    const anchor = { x: 500, y: 500 };
    const start = { x: 500, y: 500 };
    const far = advanceBriarStag(start, anchor, { x: 1000, y: 1000 }, 0, 1);
    const close = advanceBriarStag(start, anchor, { x: 510, y: 500 }, 0, 1);
    expect(far.x).toBeGreaterThan(start.x);
    expect(close.x).toBeLessThan(far.x);
    let point = start;
    for (let i = 0; i < 1000; i++) point = advanceBriarStag(point, anchor, { x: 510, y: 500 }, i / 60, 1 / 60);
    expect(Math.hypot(point.x - anchor.x, point.y - anchor.y)).toBeLessThanOrEqual(145);
  });
});
