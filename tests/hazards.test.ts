import { describe, expect, it } from 'vitest';
import { hazardSites, ventPhase } from '../src/game/hazards';

describe('region hazards', () => {
  it('places different hazards on the later regions without blocking the starting clearing', () => {
    expect(hazardSites(12345, 0)).toEqual([]);
    const quarry = hazardSites(12345, 1);
    const moonfen = hazardSites(12345, 2);
    expect(hazardSites(12345, 1)).toEqual(quarry);
    expect(quarry.map(site => site.kind)).toEqual(['vent', 'vent']);
    expect(moonfen.map(site => site.kind)).toEqual(['bloom', 'bloom']);
    for (const site of [...quarry, ...moonfen]) {
      expect(site.x).toBeGreaterThan(120);
      expect(site.x).toBeLessThan(1680);
      expect(site.y).toBeGreaterThan(120);
      expect(site.y).toBeLessThan(1680);
      expect(Math.hypot(site.x - 900, site.y - 900)).toBeGreaterThan(120);
    }
  });

  it('gives vents a visible warning before a short damaging eruption', () => {
    expect(ventPhase(3.49, 0, 0)).toBe('idle');
    expect(ventPhase(3.5, 0, 0)).toBe('warning');
    expect(ventPhase(5.2, 0, 0)).toBe('eruption');
    expect(ventPhase(6, 0, 0)).toBe('idle');
    expect(ventPhase(3.5, 1, 0)).toBe('eruption');
  });
});
