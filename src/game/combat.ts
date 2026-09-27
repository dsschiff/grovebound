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
  return Math.round(attack * WEAPON_INFO[weapon].multiplier * (1 + (rank - 1) * 0.18));
}
export function weaponSplash(weapon: Weapon, bonus: number, rank = 1): number {
  if (weapon === 'axe') return WEAPON_INFO.axe.splash + bonus + (rank >= 2 ? 20 : 0) + (rank >= 3 ? 16 : 0);
  if (weapon === 'staff') return WEAPON_INFO.staff.splash + bonus + (rank >= 3 ? 30 : 0);
  return 0;
}
export function thornPierceCount(rank: number): number { return Math.max(1, Math.min(3, rank)); }
export function bowCriticalChance(rank: number): number { return rank >= 3 ? 0.45 : rank >= 2 ? 0.35 : 0.22; }
export function staffBurn(rank: number, damage: number): { seconds: number; tickDamage: number } {
  return { seconds: rank >= 3 ? 5 : rank >= 2 ? 4 : 3,
    tickDamage: Math.max(3, Math.round(damage * (rank >= 3 ? 0.34 : rank >= 2 ? 0.29 : 0.24))) };
}
export function pierceTargets(origin: Point, first: Point, range: number, candidates: Point[], count: number): number[] {
  const firstDistance = Math.hypot(first.x - origin.x, first.y - origin.y);
  if (firstDistance <= 0) return [];
  const ux = (first.x - origin.x) / firstDistance;
  const uy = (first.y - origin.y) / firstDistance;
  const aligned: { index: number; along: number }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const dx = candidates[i].x - origin.x;
    const dy = candidates[i].y - origin.y;
    const along = dx * ux + dy * uy;
    const sideways = Math.abs(dx * uy - dy * ux);
    if (along > firstDistance + 5 && along <= range && sideways <= 24) aligned.push({ index: i, along });
  }
  return aligned.sort((a, b) => a.along - b.along).slice(0, count).map(item => item.index);
}
export function pierceTarget(origin: Point, first: Point, range: number, candidates: Point[]): number | null {
  return pierceTargets(origin, first, range, candidates, 1)[0] ?? null;
}
export function ricochetTarget(origin: Point, candidates: Point[], range = 150): number | null {
  let picked: number | null = null;
  let nearest = range;
  for (let i = 0; i < candidates.length; i++) {
    const distance = Math.hypot(candidates[i].x - origin.x, candidates[i].y - origin.y);
    if (distance < nearest) { nearest = distance; picked = i; }
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
  if (pool.weapons.length < pool.slots) {
    const newWeapons = choices.filter(choice => choice.startsWith('weapon:')
      && !pool.weapons.some(weapon => weapon.id === choice.slice(7)));
    if (newWeapons.length > 0) {
      const choice = newWeapons[rng.between(0, newWeapons.length - 1)];
      selected.push(choice);
      choices.splice(choices.indexOf(choice), 1);
    }
  }
  const rankChoices = choices.filter(choice => choice.startsWith('weapon:')
    && pool.weapons.some(weapon => weapon.id === choice.slice(7)));
  const rankOffers = pool.weapons.length >= pool.slots && pool.weapons.length > 1 ? 2 : 1;
  let rankSelected = 0;
  while (selected.length < 3 && rankChoices.length > 0 && rankSelected < rankOffers) {
    const choice = rankChoices.splice(rng.between(0, rankChoices.length - 1), 1)[0];
    selected.push(choice); rankSelected++;
    choices.splice(choices.indexOf(choice), 1);
  }
  while (selected.length < 3 && choices.length > 0) selected.push(choices.splice(rng.between(0, choices.length - 1), 1)[0]);
  return selected;
}
