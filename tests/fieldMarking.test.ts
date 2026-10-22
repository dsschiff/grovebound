import { describe, expect, it } from 'vitest';
import { MARK_REACH, MINE_REACH, TAP_RADIUS, fieldHitColor, fieldReward, isTerrainField, mineTarget, nearestTerrainField,
  tappedTerrainField } from '../src/game/fieldMarking';

const field = (kind: string, x: number, y: number, extra: Partial<{ active: boolean; hp: number }> = {}) =>
  ({ kind, x, y, active: true, hp: 100, ...extra });

describe('terrain field classification', () => {
  it('counts only bramble, ore and moonstone as fields', () => {
    for (const kind of ['bramble', 'ore', 'moonstone']) expect(isTerrainField({ kind })).toBe(true);
    for (const kind of ['vent', 'bloom', 'shrine', 'relic', 'gate', 'pump', 'forge', 'altar', 'stag']) expect(isTerrainField({ kind })).toBe(false);
  });

  it('maps each field to its HUD reward and hit colour', () => {
    expect(fieldReward('bramble')).toBe('speed');
    expect(fieldReward('ore')).toBe('attack');
    expect(fieldReward('moonstone')).toBe('reach');
    expect(fieldHitColor('bramble')).toBe('#bbeba5');
    expect(fieldHitColor('ore')).toBe('#ffb47d');
    expect(fieldHitColor('moonstone')).toBe('#d9c8ff');
  });
});

describe('field selection', () => {
  const hero = { x: 0, y: 0 };

  it('picks the nearest live field strictly inside the reach and ignores other objects', () => {
    const objects = [field('vent', 10, 0), field('ore', 150, 0), field('bramble', 0, 90), field('moonstone', 50, 0, { hp: 0 }),
      field('ore', 20, 0, { active: false })];
    expect(nearestTerrainField(objects, hero, MINE_REACH)).toBe(objects[2]);
    expect(nearestTerrainField([field('ore', MINE_REACH, 0)], hero, MINE_REACH)).toBeUndefined();
    expect(nearestTerrainField([field('ore', 250, 0)], hero, MINE_REACH)).toBeUndefined();
    expect(nearestTerrainField([field('ore', 250, 0)], hero, MARK_REACH)?.x).toBe(250);
  });

  it('keeps list order on equal distances', () => {
    const objects = [field('ore', 100, 0), field('bramble', -100, 0)];
    expect(nearestTerrainField(objects, hero, MINE_REACH)).toBe(objects[0]);
  });

  it('mines an explicit target in reach, otherwise the nearest field', () => {
    const near = field('bramble', 40, 0); const far = field('ore', 300, 0); const spent = field('ore', 100, 0, { hp: 0 });
    expect(mineTarget([near, far], hero, far)).toBe(near);
    expect(mineTarget([near, far], hero)).toBe(near);
    // An explicit target is not re-checked for hp, matching the scene's tap path.
    expect(mineTarget([near, spent], hero, spent)).toBe(spent);
    expect(mineTarget([near], hero, field('vent', 10, 0))).toBe(near);
    expect(mineTarget([far], hero)).toBeUndefined();
  });

  it('selects the first live field under a tap', () => {
    const objects = [field('vent', 0, 0), field('ore', 50, 0, { active: false }), field('moonstone', 60, 0), field('bramble', 10, 0)];
    expect(tappedTerrainField(objects, { x: 0, y: 0 })).toBe(objects[2]);
    expect(tappedTerrainField(objects, { x: 0, y: TAP_RADIUS + 1 })).toBeUndefined();
  });
});
