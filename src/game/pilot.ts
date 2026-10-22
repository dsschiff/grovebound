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
  /**
   * Default true (the PR #9 policy). False is the pilot-matrix "solo" arm: the pilot never lands a chain. Every
   * distinct weapon pair resonates (resonance.ts PAIRS), so while a chain is open it withholds every other slot; the
   * firing moments are otherwise the same rules 2 and 3 below, so the command rate stays comparable.
   */
  pairing?: boolean;
}
export type PilotCommandReason = 'resonance' | 'open-pair' | 'solo' | 'cluster' | 'elite';
export interface PilotCommandChoice { weapon: Weapon; resonance: Resonance | null; reason: PilotCommandReason }

export function pilotCommand(input: PilotCommandInput): PilotCommandChoice | null {
  const minCluster = input.minCluster ?? 3;
  const pairing = input.pairing ?? true;
  const chain = input.chain;
  const chainOpen = !!chain && chain.remaining > 0;
  const fireable = input.slots.filter(slot => slot.cooldown <= 0)
    // Solo arm: a different weapon inside an open chain would land a resonance, so it is not a candidate.
    .filter(slot => pairing || !chainOpen || slot.weapon === chain!.weapon || resonanceFor(chain!.weapon, slot.weapon) === null)
    .map(slot => ({
      slot,
      targets: input.enemies.filter(enemy => Math.hypot(enemy.x - input.hero.x, enemy.y - input.hero.y) <= slot.range),
    })).filter(option => option.targets.length > 0);
  if (!fireable.length) return null;

  // 1. A chain is open: tap a different ready slot to land the resonance.
  if (pairing && chain && chainOpen) {
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
  // The solo arm keeps this trigger (another command will be ready soon) but the chain it opens is never landed.
  if (partner) return { weapon, resonance: null, reason: pairing ? 'open-pair' : 'solo' };

  // 3. No pairing possible: spend a command alone only on a dense cluster or an elite.
  if (best.targets.length >= minCluster) return { weapon, resonance: null, reason: 'cluster' };
  const elite = fireable.find(option => option.targets.some(enemy => enemy.elite));
  return elite ? { weapon: elite.slot.weapon, resonance: null, reason: 'elite' } : null;
}

// Pilot-matrix "restore" arm. A command tap also focuses the commanded weapon (GroveScene.focusWeapon), which changes
// auto-attack damage until focus moves again. The restore arm taps the run's starting weapon afterwards through the
// same player path. That tap only changes focus when the starting weapon's command is recharging; when it is ready it
// would fire a new command (and could land a resonance), so the restore waits. The matrix measures that wait as
// off-focus seconds.
export interface PilotFocusInput { focused: Weapon; start: Weapon; startCommandCooldown: number }

export function pilotShouldRestoreFocus(input: PilotFocusInput): boolean {
  return input.focused !== input.start && input.startCommandCooldown > 0;
}
