// Objective-role predicates that GroveScene repeated inline. The delivery forge and the ritual altar
// share their kind with the damageable forge core and moon altar; their small max hp marks them.

export interface RoleObject { kind: string; maxHp: number }

/** The coolant-run forge that is filled by delivering flasks (3 deliveries). */
export function isDeliveryForge(object: RoleObject): boolean {
  return object.kind === 'forge' && object.maxHp <= 3;
}

/** The altar-rite altar that is completed by holding its ring (6 steps). */
export function isRitualAltar(object: RoleObject): boolean {
  return object.kind === 'altar' && object.maxHp <= 6;
}

/**
 * Objectives advanced by escorting, defending, carrying or channelling rather than by weapon hits.
 * Weapons skip them, hitObject ignores them, and the debug pilot stands on them.
 */
export function isChanneledObjective(object: RoleObject): boolean {
  return object.kind === 'pump' || object.kind === 'waylight' || object.kind === 'seedheart' || object.kind === 'coolant'
    || object.kind === 'moonflame' || isDeliveryForge(object) || isRitualAltar(object);
}
