import { describe, expect, it } from 'vitest';
import { advanceSeedheart, nextObjective, objectiveKinds, objectivesLeft, vergeMission } from '../src/game/objectives';

describe('region objectives', () => {
  it('uses the escorted waylight instead of repeated ward attacks in a new Verge run', () => {
    const waylight = [{ kind: 'waylight' as const, x: 420, y: 650, hp: 1, active: true }];
    expect(objectiveKinds(0, waylight)).toEqual(['waylight']);
    expect(nextObjective(0, waylight)?.kind).toBe('waylight');
    waylight[0].hp = 0;
    expect(objectivesLeft(0, waylight)).toBe(0);
  });
  it('alternates the Verge mission and only charges the Seedheart while the ring is defended', () => {
    expect(vergeMission(2)).toBe('seedheart');
    expect(vergeMission(3)).toBe('waylight');
    const heart = [{ kind: 'seedheart' as const, x: 500, y: 500, hp: 15, active: true }];
    expect(objectiveKinds(0, heart)).toEqual(['seedheart']);
    expect(nextObjective(0, heart)?.kind).toBe('seedheart');
    expect(advanceSeedheart(15, 2, true, false)).toBe(13);
    expect(advanceSeedheart(13, 2, false, false)).toBe(13);
    expect(advanceSeedheart(13, 2, true, true)).toBe(13);
    expect(advanceSeedheart(1, 2, true, false)).toBe(0);
    heart[0].hp = 0;
    expect(objectivesLeft(0, heart)).toBe(0);
  });
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
