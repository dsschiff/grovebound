import { describe, expect, it } from 'vitest';
import { pilotDirection } from '../src/game/pilot';

describe('local full-run pilot', () => {
  it('travels toward objectives, avoids nearby danger, and commits to an open gate', () => {
    const base = { player: { x: 0, y: 0 }, target: { x: 100, y: 0 },
      desiredDistance: 60, enemies: [] as { x: number; y: number }[], orbitSign: 1, avoidance: 1 };
    expect(pilotDirection(base).x).toBeGreaterThan(0);
    expect(pilotDirection({ ...base, enemies: [{ x: 10, y: 0 }] }).x).toBeLessThan(0);
    expect(pilotDirection({ ...base, desiredDistance: 0, enemies: [{ x: 10, y: 0 }], avoidance: 0.1 }).x).toBeGreaterThan(0);
  });
});
