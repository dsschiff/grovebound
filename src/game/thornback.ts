export interface ChargePoint { x: number; y: number }

export interface ThornbackChargeState {
  cooldown: number;
  windup: number;
  dashRemaining: number;
  fromX: number; fromY: number; toX: number; toY: number;
  hit: boolean;
}

export const THORNBACK_WINDUP = 0.85;
export const THORNBACK_DASH_SPEED = 530;

export function thornbackTarget(from: ChargePoint, hero: ChargePoint): ChargePoint {
  const dx = hero.x - from.x; const dy = hero.y - from.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const length = Math.min(360, Math.max(180, distance + 95));
  return { x: Math.max(45, Math.min(1755, from.x + dx / distance * length)),
    y: Math.max(45, Math.min(1755, from.y + dy / distance * length)) };
}

export function advanceThornbackDash(state: ThornbackChargeState, dt: number): { remaining: number; point: ChargePoint; finished: boolean } {
  const distance = Math.max(1, Math.hypot(state.toX - state.fromX, state.toY - state.fromY));
  const remaining = Math.max(0, state.dashRemaining - THORNBACK_DASH_SPEED * Math.max(0, dt) / distance);
  const progress = 1 - remaining;
  return { remaining, point: { x: state.fromX + (state.toX - state.fromX) * progress,
    y: state.fromY + (state.toY - state.fromY) * progress }, finished: remaining === 0 };
}
