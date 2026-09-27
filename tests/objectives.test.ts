import { describe, expect, it } from 'vitest';
import { advanceSeedheart, moonMission, nextObjective, objectiveKinds, objectivesLeft, quarryMission, vergeMission } from '../src/game/objectives';

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
  it('routes new Verge seeds to a three clearing stag hunt and follows saved stag state', () => {
    expect(vergeMission(24)).toBe('stag');
    const stag = [{ kind: 'stag' as const, x: 400, y: 650, hp: 330, active: true }];
    expect(objectiveKinds(0, stag)).toEqual(['stag']);
    expect(nextObjective(0, stag)?.kind).toBe('stag');
    stag[0].hp = 110; stag[0].x = 900;
    expect(nextObjective(0, stag)?.x).toBe(900);
    stag[0].hp = 0;
    expect(objectivesLeft(0, stag)).toBe(0);
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

  it('varies region routes independently and follows the saved coolant state', () => {
    expect(quarryMission(0)).toBe('forgeAssault');
    expect(quarryMission(2)).toBe('coolantRun');
    expect(moonMission(2)).toBe('altarRite');
    expect(moonMission(4)).toBe('moonflame');
    const objects = [
      { kind: 'coolant' as const, x: 100, y: 100, hp: 2, active: true },
      { kind: 'forge' as const, x: 500, y: 500, hp: 3, active: false },
    ];
    expect(objectiveKinds(1, objects)).toEqual(['coolant', 'forge']);
    expect(objectivesLeft(1, objects)).toBe(1);
    expect(nextObjective(1, objects)?.kind).toBe('coolant');
    objects[0].hp = 0; objects[0].active = false; objects[1].active = true;
    expect(nextObjective(1, objects)?.kind).toBe('forge');
    objects[1].hp = 0;
    expect(objectivesLeft(1, objects)).toBe(0);
  });

  it('tracks Moonflame pursuit as one moving objective while blooms stay optional hazards', () => {
    const objects = [
      { kind: 'moonflame' as const, x: 100, y: 100, hp: 3, active: true },
      { kind: 'bloom' as const, x: 400, y: 400, hp: 200, active: true },
    ];
    expect(objectiveKinds(2, objects)).toEqual(['moonflame']);
    expect(objectivesLeft(2, objects)).toBe(1);
    objects[0].hp = 1; objects[0].x = 900;
    expect(nextObjective(2, objects)?.x).toBe(900);
    objects[0].hp = 0;
    expect(objectivesLeft(2, objects)).toBe(0);
  });
});
