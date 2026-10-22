import type { MoonRoute, QuarryRoute, RegionRoute } from './objectives';

// Route-choice gating that used to sit inline in GroveScene: when the open gate offers a route,
// which routes each next region accepts, and the heal granted on taking one.

export type RouteChoiceRegion = 1 | 2;

/** The hero offers a route when this close to the open gate. */
export const ROUTE_GATE_RADIUS = 82;
/** Health restored when a route is taken. */
export const ROUTE_HEAL = 25;

export const ROUTES_FOR_REGION: Readonly<Record<RouteChoiceRegion, readonly RegionRoute[]>> = {
  1: ['coolantRun', 'forgeAssault'],
  2: ['moonflame', 'altarRite'],
};

/** The region whose route an open gate offers from `region`, or null after the last region. */
export function routeChoiceAfter(region: number): RouteChoiceRegion | null {
  return region < 2 ? (region + 1) as RouteChoiceRegion : null;
}

export type RouteSelection = { region: 1; quarryRoute: QuarryRoute } | { region: 2; moonRoute: MoonRoute };

/** Accepts `route` only if it belongs to the region on offer. */
export function selectRoute(next: RouteChoiceRegion, route: RegionRoute): RouteSelection | null {
  if (next === 1) {
    if (route !== 'coolantRun' && route !== 'forgeAssault') return null;
    return { region: 1, quarryRoute: route };
  }
  if (route !== 'moonflame' && route !== 'altarRite') return null;
  return { region: 2, moonRoute: route };
}

export function healOnRoute(health: number, maxHealth: number): number {
  return Math.min(maxHealth, health + ROUTE_HEAL);
}
