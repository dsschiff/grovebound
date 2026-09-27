import type { Point } from './combat';

export const WAYLIGHT_FOLLOW_RADIUS = 145;
export const WAYLIGHT_THREAT_RADIUS = 92;
export const WAYLIGHT_SPEED = 112;

export function waylightProgress(start: Point, goal: Point, current: Point): number {
  const full = Math.hypot(goal.x - start.x, goal.y - start.y);
  return full < 1 ? 1 : Math.max(0, Math.min(1, 1 - Math.hypot(goal.x - current.x, goal.y - current.y) / full));
}

export function advanceWaylight(current: Point, goal: Point, hero: Point, enemies: Point[], dt: number): { point: Point; moving: boolean; arrived: boolean; threatened: boolean } {
  const distance = Math.hypot(goal.x - current.x, goal.y - current.y);
  if (distance <= 35) return { point: { ...current }, moving: false, arrived: true, threatened: false };
  const threatened = enemies.some(enemy => Math.hypot(enemy.x - current.x, enemy.y - current.y) < WAYLIGHT_THREAT_RADIUS);
  const moving = !threatened && Math.hypot(hero.x - current.x, hero.y - current.y) <= WAYLIGHT_FOLLOW_RADIUS;
  if (!moving) return { point: { ...current }, moving, arrived: false, threatened };
  const distanceMoved = Math.min(distance, WAYLIGHT_SPEED * dt);
  const point = { x: current.x + (goal.x - current.x) / distance * distanceMoved,
    y: current.y + (goal.y - current.y) / distance * distanceMoved };
  return { point, moving, arrived: Math.hypot(goal.x - point.x, goal.y - point.y) <= 35, threatened };
}
