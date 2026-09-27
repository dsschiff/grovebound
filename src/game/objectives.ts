import type { ObjectSave } from './runSave';
import type { Stat } from './logic';

export type Objective = Pick<ObjectSave, 'kind' | 'hp' | 'active' | 'x' | 'y'>;

export function vergeMission(seed: number): 'waylight' | 'seedheart' | 'stag' {
  if ((seed & 0x18) === 0x18) return 'stag';
  return seed % 2 === 0 ? 'seedheart' : 'waylight';
}

export type VergeContract = ReturnType<typeof vergeMission>;

export function seedForVergeContract(seed: number, contract: VergeContract): number {
  const base = seed >>> 0 || 1;
  if (contract === 'stag') return (base | 0x18) >>> 0;
  if (contract === 'seedheart') return (base & ~0x19) >>> 0 || 2;
  return ((base & ~0x18) | 1) >>> 0;
}

export function quarryMission(seed: number): 'coolantRun' | 'forgeAssault' {
  return seed & 2 ? 'coolantRun' : 'forgeAssault';
}

export function moonMission(seed: number): 'moonflame' | 'altarRite' {
  return seed & 4 ? 'moonflame' : 'altarRite';
}

export type QuarryRoute = ReturnType<typeof quarryMission>;
export type MoonRoute = ReturnType<typeof moonMission>;
export type RegionRoute = QuarryRoute | MoonRoute;

export function routeReward(route: RegionRoute): Stat {
  return { forgeAssault: 'attack', coolantRun: 'speed', altarRite: 'defense', moonflame: 'reach' }[route] as Stat;
}

export function advanceSeedheart(hp: number, dt: number, close: boolean, threatened: boolean): number {
  return close && !threatened ? Math.max(0, hp - Math.max(0, dt)) : hp;
}

export function objectiveKinds(region: number, objects: Objective[]): ObjectSave['kind'][] {
  if (region === 0 && objects.some(object => object.kind === 'stag')) return ['stag'];
  if (region === 0 && objects.some(object => object.kind === 'seedheart')) return ['seedheart'];
  if (region === 0 && objects.some(object => object.kind === 'waylight')) return ['waylight'];
  if (region === 1 && objects.some(object => object.kind === 'coolant')) return ['coolant', 'forge'];
  if (region === 1 && objects.some(object => object.kind === 'forge')) return ['pump', 'forge'];
  if (region === 2 && objects.some(object => object.kind === 'moonflame')) return ['moonflame'];
  if (region === 2 && objects.some(object => object.kind === 'altar')) return ['bloom', 'altar'];
  return ['ward'];
}

export function objectivesLeft(region: number, objects: Objective[]): number {
  if (region === 1 && objects.some(object => object.kind === 'coolant'))
    return objects.some(object => object.kind === 'forge' && object.hp > 0) ? 1 : 0;
  const required = objectiveKinds(region, objects);
  return objects.filter(object => required.includes(object.kind) && object.hp > 0).length;
}

export function nextObjective(region: number, objects: Objective[]): Objective | undefined {
  const required = objectiveKinds(region, objects);
  return objects.find(object => required.includes(object.kind) && object.active && object.hp > 0);
}

export function objectiveName(kind: ObjectSave['kind']): string {
  return {
    ward: 'ROOT TOTEM', waylight: 'WAYLIGHT MOTH', seedheart: 'SEEDHEART', stag: 'BRIAR STAG', pump: 'COOLANT PUMP',
    coolant: 'COOLANT SPRING', forge: 'FORGE CORE', moonflame: 'MOONFLAME',
    altar: 'MOON ALTAR', bloom: 'MIST BLOOM', vent: 'EMBER VENT',
    shrine: 'SHRINE', relic: 'RELIC', gate: 'GATE',
    bramble: 'BRAMBLES', ore: 'EMBER ORE', moonstone: 'MOONSTONE',
  }[kind];
}
