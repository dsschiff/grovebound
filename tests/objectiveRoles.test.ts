import { describe, expect, it } from 'vitest';
import { isChanneledObjective, isDeliveryForge, isRitualAltar } from '../src/game/objectiveRoles';

describe('objective roles', () => {
  it('tells the delivery forge from the forge core and the ritual altar from the moon altar by max hp', () => {
    expect(isDeliveryForge({ kind: 'forge', maxHp: 3 })).toBe(true);
    expect(isDeliveryForge({ kind: 'forge', maxHp: 320 })).toBe(false);
    expect(isDeliveryForge({ kind: 'altar', maxHp: 3 })).toBe(false);
    expect(isRitualAltar({ kind: 'altar', maxHp: 6 })).toBe(true);
    expect(isRitualAltar({ kind: 'altar', maxHp: 7 })).toBe(false);
    expect(isRitualAltar({ kind: 'forge', maxHp: 6 })).toBe(false);
  });

  it('marks escort, defend, carry and channel objectives as not weapon-damageable', () => {
    for (const kind of ['pump', 'waylight', 'seedheart', 'coolant', 'moonflame']) {
      expect(isChanneledObjective({ kind, maxHp: 500 })).toBe(true);
    }
    expect(isChanneledObjective({ kind: 'forge', maxHp: 3 })).toBe(true);
    expect(isChanneledObjective({ kind: 'altar', maxHp: 6 })).toBe(true);
    for (const kind of ['ward', 'stag', 'forge', 'altar', 'bloom', 'vent', 'shrine', 'relic', 'gate', 'bramble', 'ore', 'moonstone']) {
      expect(isChanneledObjective({ kind, maxHp: 320 })).toBe(false);
    }
  });
});
