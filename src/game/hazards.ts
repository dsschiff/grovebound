import { generateRegionLayout } from './logic';

export type HazardKind = 'vent' | 'bloom';
export interface HazardSite { kind: HazardKind; x: number; y: number }
export type VentPhase = 'idle' | 'warning' | 'eruption';

export function hazardSites(seed: number, region: number): HazardSite[] {
  if (region === 0) return [];
  const clearings = generateRegionLayout(seed, region).clearings;
  const destinations = [clearings[1], clearings[4]];
  return destinations.map(clearing => ({
    kind: region === 1 ? 'vent' : 'bloom',
    x: Math.round(900 + (clearing.x - 900) * 0.55),
    y: Math.round(900 + (clearing.y - 900) * 0.55),
  }));
}

export function ventPhase(seconds: number, x: number, y: number): VentPhase {
  const offset = ((Math.round(x + y) % 3) + 3) % 3 * 2;
  const phase = (seconds + offset) % 6;
  return phase >= 5.2 ? 'eruption' : phase >= 3.5 ? 'warning' : 'idle';
}
