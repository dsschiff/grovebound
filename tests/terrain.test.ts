import { describe, expect, it } from 'vitest';
import { enemyFieldModifiers, terrainRupture, terrainSites } from '../src/game/terrain';

describe('tactical terrain placement', () => {
  it('places all three field types with the region theme nearest the start', () => {
    for (const seed of [1, 7821, 0xffffffff]) {
      for (const [region, kind] of ['bramble', 'ore', 'moonstone'].entries()) {
        const sites = terrainSites(seed, region);
        expect(sites).toEqual(terrainSites(seed, region));
        expect(sites).toHaveLength(3);
        expect(sites[0].kind).toBe(kind);
        expect(new Set(sites.map(site => site.kind))).toEqual(new Set(['bramble', 'ore', 'moonstone']));
        expect(Math.hypot(sites[0].x - 900, sites[0].y - 900)).toBeGreaterThan(155);
        expect(Math.hypot(sites[0].x - 900, sites[0].y - 900)).toBeLessThan(170);
        expect(sites.every(site => site.x > 100 && site.x < 1700
          && site.y > 100 && site.y < 1700)).toBe(true);
        expect(Math.hypot(sites[0].x - sites[1].x, sites[0].y - sites[1].y)).toBeGreaterThan(150);
      }
    }
  });

  it('changes nearby foes only while a terrain field remains active', () => {
    const fields = [
      { kind: 'bramble', x: 100, y: 100, active: true },
      { kind: 'ore', x: 100, y: 100, active: true },
      { kind: 'moonstone', x: 500, y: 500, active: true },
    ];
    expect(enemyFieldModifiers(100, 100, fields)).toEqual({ speed: 0.62, damageTaken: 0.7 });
    expect(enemyFieldModifiers(500, 500, fields)).toEqual({ speed: 1.35, damageTaken: 1 });
    fields[0].active = false;
    expect(enemyFieldModifiers(100, 100, fields)).toEqual({ speed: 1, damageTaken: 0.7 });
    expect(enemyFieldModifiers(900, 900, fields)).toEqual({ speed: 1, damageTaken: 1 });
  });

  it('gives each field a distinct combat payoff', () => {
    expect(terrainRupture('bramble')).toMatchObject({ tangleSeconds: 4, moonflowSeconds: 0 });
    expect(terrainRupture('ore').damage).toBeGreaterThan(terrainRupture('bramble').damage);
    expect(terrainRupture('moonstone')).toMatchObject({ moonflowSeconds: 6 });
    for (const kind of ['bramble', 'ore', 'moonstone'] as const) {
      expect(terrainRupture(kind).radius).toBeGreaterThan(200);
      expect(terrainRupture(kind).hint).toContain('TAP');
    }
  });
});
