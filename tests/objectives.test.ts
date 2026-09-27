import { describe, expect, it } from 'vitest';
import { nextObjective, objectiveKinds, objectivesLeft } from '../src/game/objectives';

describe('region objectives', () => {
  it('opens Quarry forge only after the coolant pump', () => {
    const objects = [
      { kind: 'pump' as const, x: 100, y: 100, hp: 200, active: true },
      { kind: 'forge' as const, x: 500, y: 500, hp: 300, active: false },
    ];
    expect(objectivesLeft(1, objects)).toBe(2);
    expect(nextObjective(1, objects)?.kind).toBe('pump');
    objects[0].hp = 0; objects[0].active = false;
    expect(objectivesLeft(1, objects)).toBe(1);
    expect(nextObjective(1, objects)).toBeUndefined();
    objects[1].active = true;
    expect(nextObjective(1, objects)?.kind).toBe('forge');
  });

  it('requires Moonfen blooms before the altar and keeps old ward saves playable', () => {
    const objects = [
      { kind: 'bloom' as const, x: 100, y: 100, hp: 100, active: true },
      { kind: 'bloom' as const, x: 200, y: 200, hp: 100, active: true },
      { kind: 'altar' as const, x: 500, y: 500, hp: 300, active: false },
    ];
    expect(objectivesLeft(2, objects)).toBe(3);
    objects[0].hp = 0; objects[1].hp = 0;
    expect(objectivesLeft(2, objects)).toBe(1);
    expect(objectiveKinds(2, [{ kind: 'ward', x: 100, y: 100, hp: 40, active: true }])).toEqual(['ward']);
  });
});
