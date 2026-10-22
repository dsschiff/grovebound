import type { Stat } from './logic';
import type { TerrainKind } from './terrain';

// Terrain-field rules that used to sit inline in GroveScene: which world objects count as
// mineable fields, and which field a mine order, an F-key mark or a tap selects.

export interface FieldCandidate { kind: string; x: number; y: number; active: boolean; hp: number }

/** A mine order reaches fields this close to the hero. */
export const MINE_REACH = 205;
/** The F key marks the nearest field within this distance of the hero. */
export const MARK_REACH = 300;
/** A tap selects a field when it lands this close to the field's centre. */
export const TAP_RADIUS = 76;

export function isTerrainField(object: { kind: string }): object is { kind: TerrainKind } {
  return object.kind === 'bramble' || object.kind === 'ore' || object.kind === 'moonstone';
}

function distance(ax: number, ay: number, bx: number, by: number): number { return Math.hypot(ax - bx, ay - by); }

/** Nearest live terrain field strictly closer than `reach`; ties keep list order. */
export function nearestTerrainField<T extends FieldCandidate>(objects: readonly T[], from: { x: number; y: number }, reach: number): T | undefined {
  return objects.filter(object => isTerrainField(object) && object.active && object.hp > 0
    && distance(from.x, from.y, object.x, object.y) < reach)
    .sort((a, b) => distance(from.x, from.y, a.x, a.y)
      - distance(from.x, from.y, b.x, b.y))[0];
}

/** The field a mine order hits: an explicit in-reach target, else the nearest minable field. */
export function mineTarget<T extends FieldCandidate>(objects: readonly T[], hero: { x: number; y: number }, target?: T): T | undefined {
  return target && target.active && isTerrainField(target)
    && distance(hero.x, hero.y, target.x, target.y) < MINE_REACH ? target : nearestTerrainField(objects, hero, MINE_REACH);
}

/** The first live terrain field under a tap at world position `point`. */
export function tappedTerrainField<T extends FieldCandidate>(objects: readonly T[], point: { x: number; y: number }): T | undefined {
  return objects.find(object => isTerrainField(object) && object.active && object.hp > 0
    && distance(point.x, point.y, object.x, object.y) < TAP_RADIUS);
}

/** The stat a broken field rewards, as shown on the HUD. */
export function fieldReward(kind: TerrainKind): Stat {
  return kind === 'bramble' ? 'speed' : kind === 'ore' ? 'attack' : 'reach';
}

/** Burst colour when a field is struck. */
export function fieldHitColor(kind: string): string {
  return kind === 'bramble' ? '#bbeba5' : kind === 'ore' ? '#ffb47d' : '#d9c8ff';
}
