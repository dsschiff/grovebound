import type { Point } from './combat';
import type { Weapon } from './logic';
import { resonanceFor, type CommandChain, type Resonance } from './resonance';

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

// Debug-pilot weapon commands. A command slot is what the player taps: it fires only with a foe in its command
// range (GroveScene.autoAttack scales base range by reach and the command multiplier) and then recharges for
// eight seconds. A different command inside the chain window (GroveScene.focusWeapon, resonance.ts
// commandChainResult) fires a pair resonance. This decides which slot to tap this frame, or none.
export interface PilotCommandSlot { weapon: Weapon; cooldown: number; range: number }
export interface PilotEnemy extends Point { elite?: boolean }
export interface PilotCommandInput {
  hero: Point;
  slots: PilotCommandSlot[];
  enemies: PilotEnemy[];
  chain: CommandChain | null;
  chainWindow: number;
  /** Foes in range that justify a command whose partner cannot follow inside the chain window. Default 3. */
  minCluster?: number;
}
export type PilotCommandReason = 'resonance' | 'open-pair' | 'cluster' | 'elite';
export interface PilotCommandChoice { weapon: Weapon; resonance: Resonance | null; reason: PilotCommandReason }

export function pilotCommand(input: PilotCommandInput): PilotCommandChoice | null {
  const minCluster = input.minCluster ?? 3;
  const fireable = input.slots.filter(slot => slot.cooldown <= 0).map(slot => ({
    slot,
    targets: input.enemies.filter(enemy => Math.hypot(enemy.x - input.hero.x, enemy.y - input.hero.y) <= slot.range),
  })).filter(option => option.targets.length > 0);
  if (!fireable.length) return null;

  // 1. A chain is open: tap a different ready slot to land the resonance.
  const chain = input.chain;
  if (chain && chain.remaining > 0) {
    for (const option of fireable) {
      const resonance = option.slot.weapon !== chain.weapon ? resonanceFor(chain.weapon, option.slot.weapon) : null;
      if (resonance) return { weapon: option.slot.weapon, resonance, reason: 'resonance' };
    }
  }

  // Most foes in range wins; ties keep slot order so the choice is deterministic.
  const best = fireable.reduce((winner, option) => option.targets.length > winner.targets.length ? option : winner);
  const weapon = best.slot.weapon;

  // 2. Open a chain when a partner slot will be ready before the window closes.
  const partner = input.slots.some(slot => slot.weapon !== weapon && resonanceFor(weapon, slot.weapon) !== null
    && slot.cooldown < input.chainWindow);
  if (partner) return { weapon, resonance: null, reason: 'open-pair' };

  // 3. No pairing possible: spend a command alone only on a dense cluster or an elite.
  if (best.targets.length >= minCluster) return { weapon, resonance: null, reason: 'cluster' };
  const elite = fireable.find(option => option.targets.some(enemy => enemy.elite));
  return elite ? { weapon: elite.slot.weapon, resonance: null, reason: 'elite' } : null;
}
