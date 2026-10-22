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
// same player path. That tap only changes focus when the starting weapon's command is recharging or has no target in
// command range; otherwise it would fire a new command (and could land a resonance), so the restore waits. The matrix
// measures that wait as off-focus seconds.
export interface PilotFocusInput { focused: Weapon; start: Weapon; startCommandCooldown: number; startHasTarget: boolean }

export function pilotShouldRestoreFocus(input: PilotFocusInput): boolean {
  return input.focused !== input.start && (input.startCommandCooldown > 0 || !input.startHasTarget);
}

// Pilot-matrix "weak" arm: a lower-skill pilot built on top of the normal pilot's decisions. Nothing in the game calls
// this; scripts/pilot-matrix.mjs --skill wraps the scene's debug pilot with it, and without --skill the pilot is
// untouched. Each frame the normal pilot produces an intent (a stick direction plus any special press or command tap
// it wants). The filter
//   - delays the whole intent by reactionMs of game time: the stick follows the direction chosen reactionMs ago (held
//     still until the first decision is that old), and a press happens reactionMs after the pilot first wanted it;
//   - acts on only every actEvery-th chance per action. A chance is one unbroken run of frames in which the pilot
//     wants that action (the special, or one weapon's command); a taken chance gives exactly one press, at its start.
// reactionMs 0 and actEvery 1 give the normal pilot's stick direction every frame and its first press of every chance
// (tests/pilot.test.ts); the normal pilot would also repeat a press that did nothing, which this filter does not.
export interface PilotSkill { reactionMs?: number; actEvery?: number }
export type PilotAction = { kind: 'special' } | { kind: 'command'; weapon: Weapon };
export interface PilotIntent { direction: Point; actions: PilotAction[] }

const actionKey = (action: PilotAction) => action.kind === 'special' ? 'special' : `command:${action.weapon}`;

export function createPilotSkillFilter(skill: PilotSkill = {}): (nowSeconds: number, intent: PilotIntent) => PilotIntent {
  const delay = Math.max(0, skill.reactionMs ?? 0) / 1000;
  const every = Math.max(1, Math.floor(skill.actEvery ?? 1));
  const wantedLastFrame = new Set<string>();
  const chances = new Map<string, number>();
  const queue: { at: number; direction: Point; actions: PilotAction[] }[] = [];
  let direction: Point = { x: 0, y: 0 };
  return (now, intent) => {
    const actions: PilotAction[] = [];
    const wanted = new Set<string>();
    for (const action of intent.actions) {
      const key = actionKey(action);
      if (wanted.has(key)) continue;
      wanted.add(key);
      if (wantedLastFrame.has(key)) continue; // same chance, already counted
      const count = (chances.get(key) ?? 0) + 1;
      chances.set(key, count);
      if (count % every === 0) actions.push(action);
    }
    wantedLastFrame.clear();
    for (const key of wanted) wantedLastFrame.add(key);
    queue.push({ at: now, direction: { x: intent.direction.x, y: intent.direction.y }, actions });
    const due: PilotAction[] = [];
    // A small epsilon keeps fixed 60 Hz steps from missing a frame to float drift in the game clock.
    while (queue.length && queue[0].at <= now - delay + 1e-9) {
      const frame = queue.shift()!;
      direction = frame.direction;
      due.push(...frame.actions);
    }
    return { direction: { x: direction.x, y: direction.y }, actions: due };
  };
}
