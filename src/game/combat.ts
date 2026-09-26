import { STAT_KEYS, WEAPON_INFO, canUpgradeStat, type Stat, type Stats, type Upgrade, type Weapon, type Rng } from './logic';

export interface Point { x: number; y: number }

export function chooseAutoTarget(origin: Point, range: number, enemies: Point[], objects: Point[]): { kind: 'enemy' | 'object'; index: number } | null {
  let index = -1;
  let nearest = range;
  for (let i = 0; i < enemies.length; i++) {
    const distance = Math.hypot(origin.x - enemies[i].x, origin.y - enemies[i].y);
    if (distance < nearest) { nearest = distance; index = i; }
  }
  if (index >= 0) return { kind: 'enemy', index };
  for (let i = 0; i < objects.length; i++) {
    const distance = Math.hypot(origin.x - objects[i].x, origin.y - objects[i].y);
    if (distance < nearest) { nearest = distance; index = i; }
  }
  return index >= 0 ? { kind: 'object', index } : null;
}

export function weaponDamage(attack: number, weapon: Weapon, rank: number): number {
  return Math.round(attack * WEAPON_INFO[weapon].multiplier * (1 + (rank - 1) * 0.35));
}
export function weaponSplash(weapon: Weapon, bonus: number): number {
  return WEAPON_INFO[weapon].splash > 0 ? WEAPON_INFO[weapon].splash + bonus : 0;
}
export function pierceTarget(origin: Point, first: Point, range: number, candidates: Point[]): number | null {
  const firstDistance = Math.hypot(first.x - origin.x, first.y - origin.y);
  if (firstDistance <= 0) return null;
  const ux = (first.x - origin.x) / firstDistance;
  const uy = (first.y - origin.y) / firstDistance;
  let picked: number | null = null;
  let nearest = range;
  for (let i = 0; i < candidates.length; i++) {
    const dx = candidates[i].x - origin.x;
    const dy = candidates[i].y - origin.y;
    const along = dx * ux + dy * uy;
    const sideways = Math.abs(dx * uy - dy * ux);
    if (along > firstDistance + 5 && along <= nearest && sideways <= 24) {
      nearest = along;
      picked = i;
    }
  }
  return picked;
}
export function bossPhaseFor(hp: number, maxHp: number): number {
  const ratio = hp / maxHp;
  return ratio <= 0.25 ? 3 : ratio <= 0.5 ? 2 : ratio <= 0.75 ? 1 : 0;
}
export function shouldSpawnGuardian(wardsLeft: number, stageSeconds: number, duration: number, spawned: boolean): boolean {
  return wardsLeft === 0 && stageSeconds >= duration && !spawned;
}

export interface UpgradePool {
  stats: Stats;
  weapons: { id: Weapon; rank: number }[];
  unlockedWeapons: Weapon[];
  slots: number;
  splashBonus: number;
  pet: boolean;
  masteryRank: number;
  level: number;
}

export function pickUpgradeChoices(pool: UpgradePool, rng: Rng): Upgrade[] {
  const choices: Upgrade[] = STAT_KEYS.filter((stat: Stat) => canUpgradeStat(pool.stats, stat));
  for (const id of pool.unlockedWeapons) {
    const owned = pool.weapons.find(weapon => weapon.id === id);
    if (owned ? owned.rank < 3 : pool.weapons.length < pool.slots) choices.push(`weapon:${id}`);
  }
  if (pool.weapons.some(weapon => WEAPON_INFO[weapon.id].splash > 0) && pool.splashBonus < 80) choices.push('splash');
  if (pool.masteryRank >= 1 && !pool.pet) choices.push('pet');
  if (pool.level >= 8 && pool.slots === 2 && rng.next() < 0.15) choices.push('wildArsenal');
  const selected: Upgrade[] = [];
  while (selected.length < 3 && choices.length > 0) selected.push(choices.splice(rng.between(0, choices.length - 1), 1)[0]);
  return selected;
}
