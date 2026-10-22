import { describe, expect, it } from 'vitest';
import { pilotCommand, pilotDirection, pilotShouldRestoreFocus, type PilotCommandInput } from '../src/game/pilot';

describe('local full-run pilot', () => {
  it('travels toward objectives, avoids nearby danger, and commits to an open gate', () => {
    const base = { player: { x: 0, y: 0 }, target: { x: 100, y: 0 },
      desiredDistance: 60, enemies: [] as { x: number; y: number }[], orbitSign: 1, avoidance: 1 };
    expect(pilotDirection(base).x).toBeGreaterThan(0);
    expect(pilotDirection({ ...base, enemies: [{ x: 10, y: 0 }] }).x).toBeLessThan(0);
    expect(pilotDirection({ ...base, desiredDistance: 0, enemies: [{ x: 10, y: 0 }], avoidance: 0.1 }).x).toBeGreaterThan(0);
  });
});

describe('pilot weapon commands', () => {
  const base: PilotCommandInput = {
    hero: { x: 0, y: 0 },
    slots: [{ weapon: 'axe', cooldown: 0, range: 160 }, { weapon: 'bow', cooldown: 0, range: 600 }],
    enemies: [{ x: 100, y: 0 }],
    chain: null,
    chainWindow: 4,
  };

  it('fires nothing when no ready command has a foe in range', () => {
    expect(pilotCommand({ ...base, enemies: [] })).toBeNull();
    expect(pilotCommand({ ...base, enemies: [{ x: 900, y: 0 }] })).toBeNull();
    expect(pilotCommand({ ...base, slots: base.slots.map(slot => ({ ...slot, cooldown: 3 })) })).toBeNull();
  });

  it('opens a pair when two commands are ready, preferring the slot with more foes in range', () => {
    const near = { ...base, enemies: [{ x: 100, y: 0 }, { x: 0, y: 120 }, { x: 400, y: 0 }] };
    expect(pilotCommand(near)).toEqual({ weapon: 'bow', resonance: null, reason: 'open-pair' });
    expect(pilotCommand({ ...base, enemies: [{ x: 100, y: 0 }] })).toEqual({ weapon: 'axe', resonance: null, reason: 'open-pair' });
  });

  it('completes an open chain with a different ready weapon and names the resonance', () => {
    const chained = { ...base, chain: { weapon: 'axe' as const, remaining: 2 },
      slots: [{ weapon: 'axe' as const, cooldown: 7, range: 160 }, { weapon: 'bow' as const, cooldown: 0, range: 600 }] };
    expect(pilotCommand(chained)).toEqual({ weapon: 'bow', resonance: 'sunbreaker', reason: 'resonance' });
    const thornsStaff = { ...base, chain: { weapon: 'staff' as const, remaining: 0.5 },
      slots: [{ weapon: 'staff' as const, cooldown: 7.5, range: 280 }, { weapon: 'thorns' as const, cooldown: 0, range: 320 }] };
    expect(pilotCommand(thornsStaff)?.resonance).toBe('wildfire');
  });

  it('does not count an expired chain as a resonance', () => {
    const expired = { ...base, chain: { weapon: 'axe' as const, remaining: 0 },
      slots: [{ weapon: 'axe' as const, cooldown: 7, range: 160 }, { weapon: 'bow' as const, cooldown: 0, range: 600 }] };
    expect(pilotCommand(expired)?.resonance ?? null).toBeNull();
  });

  it('opens a pair when the partner will recharge inside the chain window', () => {
    const soon = { ...base, slots: [{ weapon: 'axe' as const, cooldown: 0, range: 160 }, { weapon: 'bow' as const, cooldown: 3, range: 600 }] };
    expect(pilotCommand(soon)).toEqual({ weapon: 'axe', resonance: null, reason: 'open-pair' });
    expect(pilotCommand({ ...soon, chainWindow: 2 })).toBeNull();
  });

  it('fires alone, with the partner far from ready, only on a cluster or an elite', () => {
    const lonely = { ...base, slots: [{ weapon: 'axe' as const, cooldown: 0, range: 160 }, { weapon: 'bow' as const, cooldown: 7, range: 600 }] };
    expect(pilotCommand(lonely)).toBeNull();
    expect(pilotCommand({ ...lonely, enemies: [{ x: 100, y: 0 }, { x: 0, y: 100 }, { x: -90, y: 30 }] }))
      .toEqual({ weapon: 'axe', resonance: null, reason: 'cluster' });
    expect(pilotCommand({ ...lonely, minCluster: 4, enemies: [{ x: 100, y: 0 }, { x: 0, y: 100 }, { x: -90, y: 30 }] })).toBeNull();
    expect(pilotCommand({ ...lonely, enemies: [{ x: 100, y: 0, elite: true }] }))
      .toEqual({ weapon: 'axe', resonance: null, reason: 'elite' });
  });

  it('treats the range boundary as in range and ignores same-weapon chains', () => {
    const single = { ...base, slots: [{ weapon: 'staff' as const, cooldown: 0, range: 100 }], enemies: [{ x: 60, y: 80, elite: true }] };
    expect(pilotCommand(single)?.weapon).toBe('staff');
    const sameChain = { ...single, chain: { weapon: 'staff' as const, remaining: 3 } };
    expect(pilotCommand(sameChain)).toEqual({ weapon: 'staff', resonance: null, reason: 'elite' });
  });
});

describe('pilot solo arm (pairing off)', () => {
  const base: PilotCommandInput = {
    hero: { x: 0, y: 0 },
    slots: [{ weapon: 'axe', cooldown: 0, range: 160 }, { weapon: 'bow', cooldown: 0, range: 600 }],
    enemies: [{ x: 100, y: 0 }],
    chain: null,
    chainWindow: 4,
    pairing: false,
  };

  it('defaults to the PR #9 pairing policy when the switch is absent', () => {
    const noSwitch: PilotCommandInput = { ...base };
    delete noSwitch.pairing;
    const chained = { ...noSwitch, chain: { weapon: 'axe' as const, remaining: 2 },
      slots: [{ weapon: 'axe' as const, cooldown: 7, range: 160 }, { weapon: 'bow' as const, cooldown: 0, range: 600 }] };
    expect(pilotCommand(chained)?.reason).toBe('resonance');
    expect(pilotCommand({ ...chained, pairing: true })?.reason).toBe('resonance');
  });

  it('never lands an open chain: every other slot is withheld until it closes', () => {
    const chained = { ...base, chain: { weapon: 'axe' as const, remaining: 2 },
      slots: [{ weapon: 'axe' as const, cooldown: 7, range: 160 }, { weapon: 'bow' as const, cooldown: 0, range: 600 }] };
    expect(pilotCommand(chained)).toBeNull();
    // Even a dense cluster or an elite does not justify landing the chain.
    expect(pilotCommand({ ...chained, enemies: [{ x: 100, y: 0, elite: true }, { x: 0, y: 100 }, { x: -90, y: 30 }] })).toBeNull();
    const threeSlots = { ...chained, slots: [...chained.slots, { weapon: 'thorns' as const, cooldown: 0, range: 300 }] };
    expect(pilotCommand(threeSlots)).toBeNull();
  });

  it('fires once the chain has closed, at the same moments the pairing policy would open one', () => {
    const closed = { ...base, chain: { weapon: 'axe' as const, remaining: 0 },
      slots: [{ weapon: 'axe' as const, cooldown: 3.5, range: 160 }, { weapon: 'bow' as const, cooldown: 0, range: 600 }] };
    expect(pilotCommand(closed)).toEqual({ weapon: 'bow', resonance: null, reason: 'solo' });
    expect(pilotCommand({ ...closed, pairing: true })).toEqual({ weapon: 'bow', resonance: null, reason: 'open-pair' });
    expect(pilotCommand(base)).toEqual({ weapon: 'axe', resonance: null, reason: 'solo' });
  });

  it('keeps the cluster and elite rules when no other command will be ready soon', () => {
    const lonely = { ...base, slots: [{ weapon: 'axe' as const, cooldown: 0, range: 160 }, { weapon: 'bow' as const, cooldown: 7, range: 600 }] };
    expect(pilotCommand(lonely)).toBeNull();
    expect(pilotCommand({ ...lonely, enemies: [{ x: 100, y: 0 }, { x: 0, y: 100 }, { x: -90, y: 30 }] }))
      .toEqual({ weapon: 'axe', resonance: null, reason: 'cluster' });
    expect(pilotCommand({ ...lonely, enemies: [{ x: 100, y: 0, elite: true }] }))
      .toEqual({ weapon: 'axe', resonance: null, reason: 'elite' });
  });

  it('still allows the chain weapon itself, which cannot resonate with its own chain', () => {
    const single = { ...base, slots: [{ weapon: 'staff' as const, cooldown: 0, range: 100 }], enemies: [{ x: 60, y: 80, elite: true }],
      chain: { weapon: 'staff' as const, remaining: 3 } };
    expect(pilotCommand(single)).toEqual({ weapon: 'staff', resonance: null, reason: 'elite' });
  });
});

describe('pilot focus restore', () => {
  it('restores focus to the starting weapon only when that tap cannot fire a command', () => {
    expect(pilotShouldRestoreFocus({ focused: 'bow', start: 'axe', startCommandCooldown: 5, startHasTarget: true })).toBe(true);
    // Ready but nothing in its command range: the tap only focuses.
    expect(pilotShouldRestoreFocus({ focused: 'bow', start: 'axe', startCommandCooldown: 0, startHasTarget: false })).toBe(true);
    // Ready with a target: the tap would fire a new command, so the restore waits.
    expect(pilotShouldRestoreFocus({ focused: 'bow', start: 'axe', startCommandCooldown: 0, startHasTarget: true })).toBe(false);
    // Already focused on the starting weapon: nothing to do.
    expect(pilotShouldRestoreFocus({ focused: 'axe', start: 'axe', startCommandCooldown: 5, startHasTarget: false })).toBe(false);
  });
});
