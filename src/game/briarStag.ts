export interface StagPoint { x: number; y: number }

export function stagLeg(hp: number, maxHp: number): number {
  if (hp <= 0) return 3;
  if (hp <= maxHp / 3) return 2;
  if (hp <= maxHp * 2 / 3) return 1;
  return 0;
}

export function strikeBriarStag(hp: number, maxHp: number, damage: number): { hp: number; leap: number | null; dealt: number } {
  const leg = stagLeg(hp, maxHp);
  const floor = leg === 0 ? maxHp * 2 / 3 : leg === 1 ? maxHp / 3 : 0;
  const remaining = Math.max(floor, hp - Math.max(0, damage));
  const next = stagLeg(remaining, maxHp);
  return { hp: remaining, leap: remaining > 0 && next > leg ? next : null, dealt: hp - remaining };
}

export function advanceBriarStag(point: StagPoint, anchor: StagPoint, hero: StagPoint, seconds: number, dt: number): StagPoint {
  const orbit = { x: anchor.x + Math.cos(seconds * 0.83) * 88,
    y: anchor.y + Math.sin(seconds * 0.83) * 70 };
  const fromHero = { x: point.x - hero.x, y: point.y - hero.y };
  const gap = Math.max(1, Math.hypot(fromHero.x, fromHero.y));
  const flee = Math.max(0, Math.min(100, (190 - gap) * 0.6));
  const desired = { x: orbit.x + fromHero.x / gap * flee, y: orbit.y + fromHero.y / gap * flee };
  const offset = { x: desired.x - anchor.x, y: desired.y - anchor.y };
  const anchorGap = Math.hypot(offset.x, offset.y);
  if (anchorGap > 145) {
    desired.x = anchor.x + offset.x / anchorGap * 145;
    desired.y = anchor.y + offset.y / anchorGap * 145;
  }
  const dx = desired.x - point.x; const dy = desired.y - point.y;
  const step = Math.min(Math.hypot(dx, dy), 96 * Math.max(0, dt));
  const length = Math.max(1, Math.hypot(dx, dy));
  return { x: point.x + dx / length * step, y: point.y + dy / length * step };
}
