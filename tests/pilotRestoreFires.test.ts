import { describe, expect, it } from 'vitest';
import { chooseAutoTarget } from '../src/game/combat';
import { WEAPON_INFO, type Weapon } from '../src/game/logic';
import { pilotShouldRestoreFocus } from '../src/game/pilot';

// restoreFires tripwire. The pilot matrix's "restore" arm taps the starting weapon after a command to move focus
// back; GroveScene counts a tap that fired a new command as restoreFires, which must stay 0 (an extra command would
// skew the off-focus evidence). Whether the tap fires is decided by focusWeapon -> autoAttack(commanded): it fires
// when the command is charged and a commanded attack finds a target. The restore arm decides beforehand with
// pilotShouldRestoreFocus plus pilotCommandHasTarget, which re-implements autoAttack's commanded targeting. This test
// runs a seeded slice of restore decisions through a model of that firing rule and asserts it never fires. If
// autoAttack's commanded targeting changes (range, priority targets, filters), update the model here and the scene's
// pilotCommandHasTarget together.

type Point = { x: number; y: number };
interface Obj extends Point { kind: 'stag' | 'field' | 'other' }

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const commandRange = (weapon: Weapon, reach: number) => WEAPON_INFO[weapon].range * reach * (weapon === 'bow' ? 2.05 : 1.38);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// GroveScene.pilotCommandHasTarget.
function pilotHasTarget(hero: Point, range: number, enemies: Point[], objects: Obj[]): boolean {
  return chooseAutoTarget(hero, range, enemies, objects) !== null;
}

// GroveScene.focusWeapon -> autoAttack(weapon, true): marked field, then stag, then nearest enemy/object.
function tapFiresCommand(hero: Point, range: number, cooldown: number, enemies: Point[], objects: Obj[], marked: Obj | null): boolean {
  if (cooldown > 0) return false;
  const marks = marked && dist(hero, marked) < range;
  const stag = objects.some(candidate => candidate.kind === 'stag' && dist(hero, candidate) < range);
  return Boolean(marks || stag || chooseAutoTarget(hero, range, enemies, objects));
}

function runSlice(seed: number, frames: number, gated: boolean) {
  const random = seeded(seed);
  const weapons: Weapon[] = ['axe', 'bow', 'staff', 'thorns'];
  const start = weapons[seed % weapons.length];
  let restoreFires = 0;
  let restores = 0;
  for (let frame = 0; frame < frames; frame++) {
    const hero = { x: random() * 1600, y: random() * 1600 };
    const reach = 0.8 + random() * 0.8;
    const spread = 80 + random() * 700;
    const near = () => ({ x: hero.x + (random() * 2 - 1) * spread, y: hero.y + (random() * 2 - 1) * spread });
    const enemies = Array.from({ length: Math.floor(random() * 6) }, near);
    const objects: Obj[] = Array.from({ length: Math.floor(random() * 4) },
      () => ({ ...near(), kind: random() < 0.3 ? 'stag' : random() < 0.5 ? 'field' : 'other' }));
    // The marked field is one of the targetable objects (autoAttack only considers it while it is in targetObjects).
    const marked = objects.find(candidate => candidate.kind === 'field') ?? null;
    const focused = random() < 0.75 ? weapons[(weapons.indexOf(start) + 1 + Math.floor(random() * 3)) % 4] : start;
    const cooldown = random() < 0.5 ? 0 : random() * 8;
    const range = commandRange(start, reach);
    const tap = gated
      ? pilotShouldRestoreFocus({ focused, start, startCommandCooldown: cooldown,
        startHasTarget: pilotHasTarget(hero, range, enemies, objects) })
      : focused !== start;
    if (!tap) continue;
    restores++;
    if (tapFiresCommand(hero, range, cooldown, enemies, objects, marked)) restoreFires++;
  }
  return { restoreFires, restores };
}

describe('pilot restore arm (restoreFires tripwire)', () => {
  it('a restore tap fires zero commands across seeded pilot slices', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const { restoreFires, restores } = runSlice(seed, 600, true);
      expect(restoreFires, `seed ${seed}`).toBe(0);
      expect(restores, `seed ${seed} exercised the restore arm`).toBeGreaterThan(100);
    }
  });

  it('the tripwire is live: an ungated restore tap would fire commands', () => {
    const fires = [1, 2, 3].reduce((sum, seed) => sum + runSlice(seed, 600, false).restoreFires, 0);
    expect(fires).toBeGreaterThan(0);
  });

  it('a ready command with a priority target in range is never restored over', () => {
    const hero = { x: 0, y: 0 };
    const range = commandRange('axe', 1);
    const stag: Obj = { x: range * 0.5, y: 0, kind: 'stag' };
    const hasTarget = pilotHasTarget(hero, range, [], [stag]);
    expect(tapFiresCommand(hero, range, 0, [], [stag], null)).toBe(true);
    expect(pilotShouldRestoreFocus({ focused: 'bow', start: 'axe', startCommandCooldown: 0, startHasTarget: hasTarget })).toBe(false);
    // Just outside command range: the tap only focuses, so restoring is safe.
    const far: Obj = { x: range + 1, y: 0, kind: 'stag' };
    expect(tapFiresCommand(hero, range, 0, [], [far], null)).toBe(false);
    expect(pilotShouldRestoreFocus({ focused: 'bow', start: 'axe', startCommandCooldown: 0,
      startHasTarget: pilotHasTarget(hero, range, [], [far]) })).toBe(true);
  });
});
