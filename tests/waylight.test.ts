import { describe, expect, it } from 'vitest';
import { advanceWaylight, waylightProgress } from '../src/game/waylight';

describe('waylight escort', () => {
  const start = { x: 200, y: 200 };
  const goal = { x: 700, y: 200 };
  it('moves toward the destination only while the hero escorts it', () => {
    expect(advanceWaylight(start, goal, { x: 500, y: 200 }, [], 1).point).toEqual(start);
    expect(advanceWaylight(start, goal, { x: 230, y: 200 }, [], 1).point.x).toBe(312);
  });
  it('pauses under enemy pressure and resumes after the threat clears', () => {
    const blocked = advanceWaylight(start, goal, start, [{ x: 250, y: 200 }], 1);
    expect(blocked.threatened).toBe(true);
    expect(blocked.point).toEqual(start);
    expect(advanceWaylight(start, goal, start, [], 1).moving).toBe(true);
  });
  it('tracks visible progress and ends at the destination', () => {
    expect(waylightProgress(start, goal, { x: 450, y: 200 })).toBeCloseTo(0.5);
    expect(advanceWaylight({ x: 680, y: 200 }, goal, { x: 680, y: 200 }, [], 0).arrived).toBe(true);
  });
});
