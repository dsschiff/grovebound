import { describe, expect, it } from 'vitest';
import { ROUTES_FOR_REGION, ROUTE_HEAL, healOnRoute, routeChoiceAfter, selectRoute } from '../src/game/routeChoice';
import type { RegionRoute } from '../src/game/objectives';

const ALL_ROUTES: RegionRoute[] = ['coolantRun', 'forgeAssault', 'moonflame', 'altarRite'];

describe('route-choice gating', () => {
  it('offers the next region from the verge and the quarry, and nothing from the last region', () => {
    expect(routeChoiceAfter(0)).toBe(1);
    expect(routeChoiceAfter(1)).toBe(2);
    expect(routeChoiceAfter(2)).toBeNull();
  });

  it('accepts only the routes that belong to the region on offer', () => {
    for (const next of [1, 2] as const) {
      for (const route of ALL_ROUTES) {
        const selection = selectRoute(next, route);
        if (ROUTES_FOR_REGION[next].includes(route)) {
          expect(selection).toEqual(next === 1 ? { region: 1, quarryRoute: route } : { region: 2, moonRoute: route });
        } else expect(selection).toBeNull();
      }
    }
  });

  it('heals 25 on taking a route without passing max health', () => {
    expect(ROUTE_HEAL).toBe(25);
    expect(healOnRoute(40, 100)).toBe(65);
    expect(healOnRoute(90, 100)).toBe(100);
    expect(healOnRoute(100, 100)).toBe(100);
  });
});
