import type { Point } from './combat';

export interface WispLanceState {
  cooldown: number; windup: number;
  fromX: number; fromY: number; toX: number; toY: number;
}

export const WISP_LANCE_WINDUP = 0.95;
export const WISP_LANCE_WIDTH = 32;

export function wispLanceTarget(hero: Point, movement: Point, speed: number): Point {
  const lead = Math.min(165, speed * WISP_LANCE_WINDUP * 0.68);
  return { x: Math.max(42, Math.min(1758, hero.x + movement.x * lead)),
    y: Math.max(42, Math.min(1758, hero.y + movement.y * lead)) };
}

export function insideWispLance(point: Point, lance: WispLanceState): boolean {
  const dx = lance.toX - lance.fromX; const dy = lance.toY - lance.fromY;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1) return false;
  const projection = Math.max(0, Math.min(1,
    ((point.x - lance.fromX) * dx + (point.y - lance.fromY) * dy) / lengthSquared));
  return Math.hypot(point.x - lance.fromX - dx * projection,
    point.y - lance.fromY - dy * projection) <= WISP_LANCE_WIDTH;
}

export function wispLanceCooldown(region: number, stageSeconds: number): number {
  return Math.max(2.8, 5.2 - region * 0.55 - stageSeconds / 440);
}

export function wispLanceDamage(region: number, stageSeconds: number): number {
  return 14 + region * 4 + Math.floor(stageSeconds / 110) * 2;
}

export function wildSurge(region: number, stageSeconds: number, duration: number): boolean {
  return region > 0 && stageSeconds >= duration * (region === 1 ? 0.55 : 0.48);
}

export function waveInterval(region: number, stageSeconds: number, surge: boolean): number {
  const base = Math.max(0.58, 1.75 - region * 0.19 - stageSeconds / 850);
  return surge ? Math.max(0.65, base * 0.78) : base;
}
