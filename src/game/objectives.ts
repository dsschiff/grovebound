import type { ObjectSave } from './runSave';

export type Objective = Pick<ObjectSave, 'kind' | 'hp' | 'active' | 'x' | 'y'>;

export function objectiveKinds(region: number, objects: Objective[]): ObjectSave['kind'][] {
  if (region === 1 && objects.some(object => object.kind === 'forge')) return ['pump', 'forge'];
  if (region === 2 && objects.some(object => object.kind === 'altar')) return ['bloom', 'altar'];
  return ['ward'];
}

export function objectivesLeft(region: number, objects: Objective[]): number {
  const required = objectiveKinds(region, objects);
  return objects.filter(object => required.includes(object.kind) && object.hp > 0).length;
}

export function nextObjective(region: number, objects: Objective[]): Objective | undefined {
  const required = objectiveKinds(region, objects);
  return objects.find(object => required.includes(object.kind) && object.active && object.hp > 0);
}

export function objectiveName(kind: ObjectSave['kind']): string {
  return {
    ward: 'ROOT TOTEM', pump: 'COOLANT PUMP', forge: 'FORGE CORE',
    altar: 'MOON ALTAR', bloom: 'MIST BLOOM', vent: 'EMBER VENT',
    shrine: 'SHRINE', relic: 'RELIC', gate: 'GATE',
  }[kind];
}
