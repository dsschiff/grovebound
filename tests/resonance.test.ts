import { describe, expect, it } from 'vitest';
import { RESONANCE_INFO, advanceCommandChain, commandChainResult, resonanceFor } from '../src/game/resonance';

describe('weapon resonances', () => {
  it('assigns a distinct finisher to every unordered pair', () => {
    const weapons = ['axe', 'thorns', 'bow', 'staff'] as const;
    const finishers = new Set<string>();
    for (let i = 0; i < weapons.length; i++) for (let j = i + 1; j < weapons.length; j++) {
      const finisher = resonanceFor(weapons[i], weapons[j]);
      expect(finisher).not.toBeNull();
      expect(resonanceFor(weapons[j], weapons[i])).toBe(finisher);
      finishers.add(finisher!);
    }
    expect(finishers.size).toBe(6);
    expect(RESONANCE_INFO.sunbreaker.eliteScale).toBeGreaterThan(1);
    expect(RESONANCE_INFO.furnaceRing.push).toBeGreaterThan(0);
    expect(RESONANCE_INFO.needleRain.maxTargets).toBe(5);
    expect(RESONANCE_INFO.briarSweep.rootSeconds).toBeGreaterThan(0);
    expect(RESONANCE_INFO.wildfire.burnSeconds).toBeGreaterThan(0);
    expect(RESONANCE_INFO.solarFlare.radius).toBeGreaterThan(RESONANCE_INFO.sunbreaker.radius);
  });

  it('fires only when a different command lands inside the four-second window', () => {
    const first = commandChainResult(null, 'axe');
    expect(first).toEqual({ chain: { weapon: 'axe', remaining: 4 }, resonance: null });
    const waiting = advanceCommandChain(first.chain, 3.9);
    expect(commandChainResult(waiting, 'bow')).toEqual({ chain: null, resonance: 'sunbreaker' });
    expect(commandChainResult(advanceCommandChain(first.chain, 4), 'bow').resonance).toBeNull();
    expect(commandChainResult(first.chain, 'axe').resonance).toBeNull();
  });
});
