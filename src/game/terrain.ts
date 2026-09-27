import { generateRegionLayout } from './logic';

export type TerrainKind = 'bramble' | 'ore' | 'moonstone';
export interface TerrainSite { kind: TerrainKind; x: number; y: number }
export interface TerrainField { kind: string; x: number; y: number; active: boolean }

export interface TerrainRupture { radius: number; damage: number; tangleSeconds: number; moonflowSeconds: number; name: string; hint: string }

export function terrainRupture(kind: TerrainKind): TerrainRupture {
  if (kind === 'bramble') return { radius: 205, damage: 15, tangleSeconds: 4, moonflowSeconds: 0,
    name: 'ROOT SNARE', hint: 'TAP BRAMBLES · ROOT NEARBY FOES' };
  if (kind === 'ore') return { radius: 220, damage: 80, tangleSeconds: 0, moonflowSeconds: 0,
    name: 'ORE BLAST', hint: 'TAP ORE · BLAST NEARBY FOES' };
  return { radius: 230, damage: 45, tangleSeconds: 0, moonflowSeconds: 6,
    name: 'MOONFLOW', hint: 'TAP MOONSTONE · BLAST + SPEED' };
}

export function enemyFieldModifiers(x: number, y: number, fields: TerrainField[]): { speed: number; damageTaken: number } {
  let speed = 1;
  let damageTaken = 1;
  for (const field of fields) {
    if (!field.active) continue;
    const distanceSq = (field.x - x) ** 2 + (field.y - y) ** 2;
    if (field.kind === 'bramble' && distanceSq < 105 ** 2) speed *= 0.62;
    if (field.kind === 'ore' && distanceSq < 145 ** 2) damageTaken *= 0.7;
    if (field.kind === 'moonstone' && distanceSq < 150 ** 2) speed *= 1.35;
  }
  return { speed, damageTaken };
}

export function terrainSites(seed: number, region: number): TerrainSite[] {
  const kind: TerrainKind = region === 0 ? 'bramble' : region === 1 ? 'ore' : 'moonstone';
  const clearings = generateRegionLayout(seed, region).clearings;
  return [clearings[2], clearings[3]].map((clearing, index) => {
    const dx = clearing.x - 900;
    const dy = clearing.y - 900;
    const length = Math.hypot(dx, dy);
    const side = (seed & 1 ? 1 : -1) * (index === 0 ? 1 : -1);
    return {
      kind,
      x: Math.round(900 + dx * 0.48 - dy / length * 85 * side),
      y: Math.round(900 + dy * 0.48 + dx / length * 85 * side),
    };
  });
}
