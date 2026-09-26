import type { Hero, Stat, Stats, Upgrade, Weapon } from './logic';

export const RUN_SAVE_KEY = 'grovebound-run-v1';
export interface EnemySave {
  kind: 'gnarl' | 'wisp' | 'brute' | 'gatekeeper' | 'boss';
  x: number; y: number; hp: number; maxHp: number; phase: number;
}
export interface ObjectSave {
  kind: 'ward' | 'shrine' | 'relic' | 'gate';
  x: number; y: number; hp: number; maxHp: number; active: boolean;
}
export interface RunSnapshot {
  version: 1;
  seed: number; rngState: number; hero: Hero; skin: boolean;
  unlockedWeapons: Weapon[]; masteryRank: number;
  weapons: { id: Weapon; rank: number; cooldown: number }[];
  weaponSlots: number; splashBonus: number; pet: boolean; petClock: number;
  autoSpecial: boolean; specialCooldown: number; reducedEffects: boolean;
  stats: Stats; health: number; xp: number; level: number; kills: number;
  seconds: number; region: number; stageSeconds: number; spawnClock: number; cacheClock: number;
  x: number; y: number; invulnerability: number;
  gatekeeperSpawned: boolean; bossSpawned: boolean; choosing: boolean; upgradeOptions: Upgrade[];
  enemies: EnemySave[]; objects: ObjectSave[];
  orbs: { x: number; y: number; value: number }[];
  caches: { x: number; y: number; stat: Stat }[];
}

const finite = (value: unknown, min = 0, max = 100000): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const HEROES = ['warden', 'ranger', 'ember'];
const WEAPONS = ['axe', 'thorns', 'bow', 'staff'];
const STATS = ['speed', 'regen', 'attack', 'defense', 'maxHealth', 'reach'];
const UPGRADES = [...STATS, 'splash', 'pet', 'wildArsenal', ...WEAPONS.map(id => `weapon:${id}`)];

export function parseRunSnapshot(value: unknown): RunSnapshot | null {
  if (typeof value !== 'object' || value === null) return null;
  const run = value as Partial<RunSnapshot>;
  if (run.version !== 1 || !finite(run.seed, 0, 4294967295) || !finite(run.rngState, 0, 4294967295)
    || !HEROES.includes(run.hero ?? '') || typeof run.skin !== 'boolean'
    || !Array.isArray(run.unlockedWeapons) || !run.unlockedWeapons.every(weapon => WEAPONS.includes(weapon))
    || !finite(run.masteryRank, 0, 5)
    || !Array.isArray(run.weapons) || run.weapons.length < 1 || run.weapons.length > 3
    || !run.weapons.every(weapon => WEAPONS.includes(weapon.id) && finite(weapon.rank, 1, 3) && finite(weapon.cooldown, -5, 20))
    || !finite(run.weaponSlots, 1, 3) || !finite(run.splashBonus, 0, 100)
    || typeof run.pet !== 'boolean' || !finite(run.petClock, -5, 20)
    || typeof run.autoSpecial !== 'boolean' || !finite(run.specialCooldown, -5, 30)
    || typeof run.reducedEffects !== 'boolean' || !run.stats
    || !finite(run.stats.speed, 1, 500) || !finite(run.stats.regen, 0, 20) || !finite(run.stats.attack, 1, 500)
    || !finite(run.stats.defense, 0, 0.6) || !finite(run.stats.maxHealth, 1, 500) || !finite(run.stats.reach, 0.5, 3)
    || !finite(run.health, 0, run.stats.maxHealth) || !finite(run.xp) || !finite(run.level, 1, 1000)
    || !finite(run.kills) || !finite(run.seconds) || !finite(run.region, 0, 2)
    || !finite(run.stageSeconds) || !finite(run.spawnClock) || !finite(run.cacheClock)
    || !finite(run.x, 0, 1800) || !finite(run.y, 0, 1800) || !finite(run.invulnerability, 0, 5)
    || typeof run.gatekeeperSpawned !== 'boolean' || typeof run.bossSpawned !== 'boolean'
    || typeof run.choosing !== 'boolean' || !Array.isArray(run.upgradeOptions)
    || !run.upgradeOptions.every(option => UPGRADES.includes(option))
    || !Array.isArray(run.enemies) || run.enemies.length > 100 || !run.enemies.every(enemy =>
      ['gnarl', 'wisp', 'brute', 'gatekeeper', 'boss'].includes(enemy.kind) && finite(enemy.x, 0, 1800)
      && finite(enemy.y, 0, 1800) && finite(enemy.hp, 0, 10000) && finite(enemy.maxHp, 1, 10000) && finite(enemy.phase, 0, 7))
    || !Array.isArray(run.objects) || run.objects.length > 10 || !run.objects.every(object =>
      ['ward', 'shrine', 'relic', 'gate'].includes(object.kind) && finite(object.x, 0, 1800)
      && finite(object.y, 0, 1800) && finite(object.hp, 0, 10000) && finite(object.maxHp, 0, 10000)
      && typeof object.active === 'boolean')
    || !Array.isArray(run.orbs) || run.orbs.length > 100 || !run.orbs.every(orb =>
      finite(orb.x, 0, 1800) && finite(orb.y, 0, 1800) && finite(orb.value, 1, 10))
    || !Array.isArray(run.caches) || run.caches.length > 10 || !run.caches.every(cache =>
      finite(cache.x, 0, 1800) && finite(cache.y, 0, 1800) && STATS.includes(cache.stat))) return null;
  return run as RunSnapshot;
}

export function readRunSnapshot(): RunSnapshot | null {
  try { return parseRunSnapshot(JSON.parse(localStorage.getItem(RUN_SAVE_KEY) ?? 'null')); } catch { return null; }
}
export function saveRunSnapshot(snapshot: RunSnapshot): void {
  try { localStorage.setItem(RUN_SAVE_KEY, JSON.stringify(snapshot)); } catch { /* Storage may be full or unavailable. */ }
}
export function clearRunSnapshot(): void {
  try { localStorage.removeItem(RUN_SAVE_KEY); } catch { /* Ignore private-mode storage errors. */ }
}
