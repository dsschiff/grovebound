import type { Weapon } from './logic';

export type Resonance = 'briarSweep' | 'sunbreaker' | 'furnaceRing' | 'needleRain' | 'wildfire' | 'solarFlare';
export interface CommandChain { weapon: Weapon; remaining: number }

export interface ResonanceInfo {
  name: string; description: string; color: string; center: 'hero' | 'target';
  radius: number; maxTargets: number; damageScale: number; eliteScale: number;
  rootSeconds: number; burnSeconds: number; push: number;
}

export const RESONANCE_INFO: Record<Resonance, ResonanceInfo> = {
  briarSweep: { name: 'Briar Sweep', description: 'Root a circle of foes around you', color: '#c5efad', center: 'hero',
    radius: 205, maxTargets: 100, damageScale: 1.5, eliteScale: 1, rootSeconds: 2.8, burnSeconds: 0, push: 0 },
  sunbreaker: { name: 'Sunbreaker', description: 'Blast an elite-breaking impact', color: '#ffe4a1', center: 'target',
    radius: 115, maxTargets: 100, damageScale: 2.7, eliteScale: 4.1 / 2.7, rootSeconds: 0, burnSeconds: 0, push: 0 },
  furnaceRing: { name: 'Furnace Ring', description: 'Push back and ignite nearby foes', color: '#ffc28d', center: 'hero',
    radius: 195, maxTargets: 100, damageScale: 1.2, eliteScale: 1, rootSeconds: 0, burnSeconds: 3, push: 110 },
  needleRain: { name: 'Needle Rain', description: 'Strike five foes around the target', color: '#d8f4b9', center: 'target',
    radius: 310, maxTargets: 5, damageScale: 2, eliteScale: 1, rootSeconds: 0, burnSeconds: 0, push: 0 },
  wildfire: { name: 'Wildfire', description: 'Root and burn a cluster of foes', color: '#ffca8d', center: 'target',
    radius: 165, maxTargets: 100, damageScale: 1.6, eliteScale: 1, rootSeconds: 2, burnSeconds: 4, push: 0 },
  solarFlare: { name: 'Solar Flare', description: 'Detonate a wide burning burst', color: '#ffe6a8', center: 'target',
    radius: 175, maxTargets: 100, damageScale: 2.2, eliteScale: 1, rootSeconds: 0, burnSeconds: 3, push: 0 },
};

const PAIRS: Record<string, Resonance> = {
  'axe:thorns': 'briarSweep', 'axe:bow': 'sunbreaker', 'axe:staff': 'furnaceRing',
  'bow:thorns': 'needleRain', 'staff:thorns': 'wildfire', 'bow:staff': 'solarFlare',
};

export function resonanceFor(first: Weapon, second: Weapon): Resonance | null {
  return PAIRS[[first, second].sort().join(':')] ?? null;
}

export function advanceCommandChain(chain: CommandChain | null, dt: number): CommandChain | null {
  if (!chain) return null;
  const remaining = Math.max(0, chain.remaining - Math.max(0, dt));
  return remaining > 0 ? { weapon: chain.weapon, remaining } : null;
}

export function commandChainResult(chain: CommandChain | null, weapon: Weapon): { chain: CommandChain | null; resonance: Resonance | null } {
  const resonance = chain && chain.remaining > 0 ? resonanceFor(chain.weapon, weapon) : null;
  return { chain: resonance ? null : { weapon, remaining: 4 }, resonance };
}
