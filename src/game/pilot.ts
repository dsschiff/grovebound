import type { Point } from './combat';

export interface PilotInput {
  player: Point;
  target: Point;
  desiredDistance: number;
  enemies: Point[];
  orbitSign: number;
  avoidance: number;
}

export function pilotDirection(input: PilotInput): Point {
  const dx = input.target.x - input.player.x;
  const dy = input.target.y - input.player.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const towardX = dx / distance;
  const towardY = dy / distance;
  let x = 0;
  let y = 0;
  if (distance > input.desiredDistance + 12) {
    x = towardX * 1.5; y = towardY * 1.5;
  } else if (distance < input.desiredDistance - 12) {
    x = -towardX; y = -towardY;
  }
  if (input.desiredDistance > 0 && distance < input.desiredDistance + 65) {
    x += -towardY * input.orbitSign * 0.9;
    y += towardX * input.orbitSign * 0.9;
  }
  for (const enemy of input.enemies) {
    const awayX = input.player.x - enemy.x;
    const awayY = input.player.y - enemy.y;
    const gap = Math.max(1, Math.hypot(awayX, awayY));
    if (gap < 125) {
      const force = (125 - gap) / 125 * 2.5 * input.avoidance;
      x += awayX / gap * force;
      y += awayY / gap * force;
    }
  }
  const length = Math.hypot(x, y);
  return length > 0.01 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}
