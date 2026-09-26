import type { Point } from './combat';

export interface BossStrikeState {
  cooldown: number;
  windup: number;
  x: number;
  y: number;
  radius: number;
}

export const BOSS_STRIKE_WINDUP = 1.15;

export function bossStrikeTarget(hero: Point, movement: Point): Point {
  const length = Math.hypot(movement.x, movement.y);
  const lead = length > 0.01 ? 150 / length : 0;
  return {
    x: Math.max(42, Math.min(1758, hero.x + movement.x * lead)),
    y: Math.max(42, Math.min(1758, hero.y + movement.y * lead)),
  };
}

export function bossStrikeRadius(phase: number): number { return 95 + Math.min(3, phase) * 15; }
export function bossStrikeCooldown(phase: number): number { return 5.6 - Math.min(3, phase) * 0.5; }
export function insideBossStrike(point: Point, strike: BossStrikeState): boolean {
  return Math.hypot(point.x - strike.x, point.y - strike.y) < strike.radius;
}
