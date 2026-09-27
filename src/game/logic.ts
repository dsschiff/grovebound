export type Stat = 'speed' | 'regen' | 'attack' | 'defense' | 'maxHealth' | 'reach';
export type Weapon = 'axe' | 'thorns' | 'bow' | 'staff';
export type WeaponPath = 'a' | 'b';
export type Ability = Weapon;
export type Hero = 'warden' | 'ranger' | 'ember';
export type CampKit = 'breaker' | 'conductor' | 'forager';
export const CAMP_KITS: CampKit[] = ['breaker', 'conductor', 'forager'];
export const CAMP_KIT_INFO: Record<CampKit, { name: string; description: string; cost: number; art: string }> = {
  breaker: { name: 'Breaker', description: 'Field bursts hit 50% harder and reach 30% farther.', cost: 0, art: 'weapon-axe-expedition-v1.webp' },
  conductor: { name: 'Conductor', description: 'Commands recharge in 7s. Chain another within 6s.', cost: 8, art: 'weapon-bow-expedition-v1.webp' },
  forager: { name: 'Forager', description: 'Every stat cache also restores 10 health.', cost: 8, art: 'ancient-tree-v1.webp' },
};
export type Upgrade = Stat | 'splash' | 'pet' | 'wildArsenal' | `weapon:${Weapon}` | `path:${Weapon}:${WeaponPath}`;

export interface Stats {
  speed: number;
  regen: number;
  attack: number;
  defense: number;
  maxHealth: number;
  reach: number;
}

export const BASE_STATS: Stats = {
  speed: 190, regen: 0.4, attack: 16, defense: 0, maxHealth: 100, reach: 1,
};

export const STAT_KEYS: Stat[] = ['speed', 'regen', 'attack', 'defense', 'maxHealth', 'reach'];
export const STAT_INFO: Record<Stat, { name: string; icon: string; color: string; description: string }> = {
  speed: { name: 'Fleetfoot', icon: '✦', color: '#8cdddc', description: 'Move 10% faster' },
  regen: { name: 'Heartwood', icon: '♥', color: '#f5ad9e', description: 'Restore 0.6 health each second' },
  attack: { name: 'Keen Edge', icon: '⚔', color: '#f9cf79', description: 'Deal 20% more damage' },
  defense: { name: 'Barkskin', icon: '◆', color: '#afbbf0', description: 'Take 8% less damage' },
  maxHealth: { name: 'Deep Roots', icon: '✚', color: '#ffb6a5', description: '+20 maximum and current health' },
  reach: { name: 'Far Reach', icon: '◎', color: '#b8e6b7', description: 'Attack 12% farther' },
};

export const HERO_INFO: Record<Hero, { name: string; title: string; weapon: Weapon; special: string; specialDescription: string; tint: number }> = {
  warden: { name: 'Warden', title: 'The stalwart guardian', weapon: 'axe', special: 'Whirlwind', specialDescription: 'Knockback and healing', tint: 0xffffff },
  ranger: { name: 'Ranger', title: 'The swift pathfinder', weapon: 'thorns', special: 'Thorn Volley', specialDescription: 'Five distant strikes', tint: 0xc8e7d3 },
  ember: { name: 'Ember', title: 'The flame keeper', weapon: 'staff', special: 'Solar Nova', specialDescription: 'A burning shockwave', tint: 0xffd7ae },
};
export const HERO_KEYS: Hero[] = ['warden', 'ranger', 'ember'];
export const WEAPON_INFO: Record<Weapon, { name: string; icon: string; description: string; range: number; cooldown: number; splash: number; multiplier: number; color: string }> = {
  axe: { name: 'Axe Cleave', icon: '⚔', description: 'Close cleave · hits a cluster', range: 115, cooldown: 0.77, splash: 42, multiplier: 1, color: '#ffe0a0' },
  thorns: { name: 'Thorn Dart', icon: '✺', description: 'Long dart · pierces aligned foes', range: 230, cooldown: 1.1, splash: 0, multiplier: 1.4, color: '#b7ec9c' },
  bow: { name: 'Sunbow', icon: '➶', description: 'Longest reach · critical hits', range: 295, cooldown: 1.25, splash: 0, multiplier: 1.75, color: '#ffe3a3' },
  staff: { name: 'Ember Staff', icon: '✹', description: 'Fireburst · burns survivors', range: 205, cooldown: 1.35, splash: 57, multiplier: 1.15, color: '#ffb37b' },
};

export const WEAPON_RANKS: Record<Weapon, [string, string, string]> = {
  axe: ['Cleave', 'Wider cleave', 'Knockback'],
  thorns: ['One pierce', 'Two pierces', 'Three pierces'],
  bow: ['22% crit', '35% crit', 'Ricochet'],
  staff: ['Burn 3s', 'Hotter burn', 'Firestorm'],
};
export const WEAPON_FOCUS: Record<Weapon, string> = {
  axe: 'Wider cleave', thorns: '+1 pierce', bow: 'Faster fire + crit', staff: 'Wider, longer burn',
};
export const WEAPON_COMMAND: Record<Weapon, { name: string; slotName: string; description: string }> = {
  axe: { name: 'Crescent Sweep', slotName: 'SWEEP', description: 'Sweep a wide arc and knock foes back' },
  thorns: { name: 'Root Volley', slotName: 'ROOT VOLLEY', description: 'Piercing fan that roots nearby foes' },
  bow: { name: 'Dawnshot', slotName: 'DAWNSHOT', description: 'Long-range critical shot that breaks elites' },
  staff: { name: 'Ember Field', slotName: 'EMBER FIELD', description: 'Leave burning ground for four seconds' },
};
export const WEAPON_PATH_INFO: Record<Weapon, Record<WeaponPath, { name: string; trait: string; description: string }>> = {
  axe: {
    a: { name: 'Storm Arc', trait: 'Wider sweep', description: 'Cleave reaches farther around its target' },
    b: { name: 'Breaker Edge', trait: 'Elite breaker', description: 'Deal 65% more damage to brutes and guardians' },
  },
  thorns: {
    a: { name: 'Split Dart', trait: 'Forked shot', description: 'A dart also strikes a nearby off-line foe' },
    b: { name: 'Rootbind', trait: 'Roots foes', description: 'Dart hits root foes for two seconds' },
  },
  bow: {
    a: { name: 'Flare Arrow', trait: 'Crit blast', description: 'Critical hits explode into nearby foes' },
    b: { name: 'Sunlance', trait: 'Piercing ray', description: 'Arrows pierce up to two foes in a line' },
  },
  staff: {
    a: { name: 'Wildfire', trait: 'Wide burn', description: 'Fireburst grows wider and burns longer' },
    b: { name: 'Ash Feast', trait: 'Burn heal', description: 'Defeating a burning foe restores four health' },
  },
};
export const WEAPON_RANK_UPGRADES: Record<Weapon, [string, string]> = {
  axe: ['Cleave reaches a wider cluster', 'Cleave knocks back smaller foes'],
  thorns: ['Darts pierce two aligned foes', 'Darts pierce three aligned foes'],
  bow: ['Critical chance rises to 35%', 'Shots ricochet to a nearby foe'],
  staff: ['Burn lasts longer and hits harder', 'Fireburst widens; burn lasts 5 seconds'],
};

export const REGIONS = [
  { name: 'Verdant Verge', short: 'VERGE', floor: 0x376f55, clearing: 0x71916a, accent: 0xc8df9a, duration: 175 },
  { name: 'Ember Quarry', short: 'QUARRY', floor: 0x665449, clearing: 0xa18465, accent: 0xffc485, duration: 205 },
  { name: 'Moonfen', short: 'MOONFEN', floor: 0x294e5b, clearing: 0x577f83, accent: 0xa8e9df, duration: 235 },
] as const;

export function baseStatsFor(hero: Hero, masteryRank = 0): Stats {
  const stats = { ...BASE_STATS };
  if (hero === 'warden') { stats.maxHealth = 110; stats.defense = 0.08; }
  if (hero === 'ranger') { stats.speed = 215; stats.maxHealth = 85; }
  if (hero === 'ember') { stats.speed = 177; stats.attack = 19; stats.maxHealth = 95; }
  if (masteryRank >= 2) stats.maxHealth += 5;
  return stats;
}

export function upgradeStat(stats: Stats, stat: Stat): Stats {
  switch (stat) {
    case 'speed': return { ...stats, speed: Math.min(330, Math.round(stats.speed * 1.1)) };
    case 'regen': return { ...stats, regen: Math.min(6, +(stats.regen + 0.6).toFixed(2)) };
    case 'attack': return { ...stats, attack: Math.min(160, Math.round(stats.attack * 1.2)) };
    case 'defense': return { ...stats, defense: Math.min(0.6, +(stats.defense + 0.08).toFixed(2)) };
    case 'maxHealth': return { ...stats, maxHealth: Math.min(240, stats.maxHealth + 20) };
    case 'reach': return { ...stats, reach: Math.min(1.8, +(stats.reach * 1.12).toFixed(2)) };
  }
}

export function canUpgradeStat(stats: Stats, stat: Stat): boolean {
  return upgradeStat(stats, stat)[stat] > stats[stat];
}

export function damageAfterDefense(raw: number, defense: number): number {
  return Math.max(1, Math.round(raw * (1 - Math.min(0.6, Math.max(0, defense)))));
}

export function xpToNextLevel(level: number): number { return 5 + level * 3; }
export function seedsForRun(kills: number, won: boolean): number { return 2 + Math.min(3, Math.floor(kills / 35)) + (won ? 3 : 0); }
export function masteryRank(xp: number): number { return [2, 5, 9, 14, 20].filter(threshold => xp >= threshold).length; }
export function availableHero(progress: Progress, hero: Hero): boolean {
  return hero === 'warden' || hero === 'ranger' && progress.bestRegion >= 1 || hero === 'ember' && progress.victories >= 1;
}
export function availableWeapon(progress: Progress, weapon: Weapon): boolean {
  return weapon === 'axe' || weapon === 'bow'
    || weapon === 'thorns' && (progress.thornsUnlocked || availableHero(progress, 'ranger'))
    || weapon === 'staff' && availableHero(progress, 'ember');
}

export interface Progress {
  seeds: number;
  thornsUnlocked: boolean;
  bestKills: number;
  bestSeconds: number;
  victories: number;
  bestRegion: number;
  mastery: Record<Hero, number>;
  reducedEffects: boolean;
  muted: boolean;
  autoSpecialEnabled: boolean;
  heroLook: HeroLook;
  appearanceVersion: number;
  unlockedKits: CampKit[];
  selectedKit: CampKit;
}

export type HeroLook = 'expedition' | 'wildkin' | 'classic';

export const EMPTY_PROGRESS: Progress = {
  seeds: 0, thornsUnlocked: false, bestKills: 0, bestSeconds: 0, victories: 0,
  bestRegion: 0, mastery: { warden: 0, ranger: 0, ember: 0 }, reducedEffects: false, muted: false,
  autoSpecialEnabled: true,
  heroLook: 'expedition', appearanceVersion: 1,
  unlockedKits: ['breaker'], selectedKit: 'breaker',
};
export const THORNS_COST = 6;
export const SAVE_KEY = 'grovebound-progress-v2';
export const LEGACY_SAVE_KEY = 'grovebound-progress-v1';

function validNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function parseProgress(value: unknown): Progress {
  if (typeof value !== 'object' || value === null) return structuredClone(EMPTY_PROGRESS);
  const data = value as Partial<Progress>;
  const savedKits = Array.isArray(data.unlockedKits) ? data.unlockedKits : [];
  const unlockedKits: CampKit[] = ['breaker', ...CAMP_KITS.filter(kit => kit !== 'breaker' && savedKits.includes(kit))];
  return {
    seeds: validNumber(data.seeds), thornsUnlocked: data.thornsUnlocked === true,
    bestKills: validNumber(data.bestKills), bestSeconds: validNumber(data.bestSeconds),
    victories: validNumber(data.victories), bestRegion: Math.min(3, validNumber(data.bestRegion)),
    mastery: {
      warden: validNumber(data.mastery?.warden), ranger: validNumber(data.mastery?.ranger), ember: validNumber(data.mastery?.ember),
    },
    reducedEffects: data.reducedEffects === true,
    muted: data.muted === true,
    autoSpecialEnabled: data.autoSpecialEnabled !== false,
    heroLook: data.heroLook === 'classic' ? 'classic'
      : data.appearanceVersion === 1 && data.heroLook === 'wildkin' ? 'wildkin' : 'expedition',
    appearanceVersion: 1,
    unlockedKits,
    selectedKit: unlockedKits.includes(data.selectedKit as CampKit) ? data.selectedKit as CampKit : 'breaker',
  };
}

export function readProgress(): Progress {
  try {
    const current = localStorage.getItem(SAVE_KEY);
    if (current) return parseProgress(JSON.parse(current));
    const legacy = localStorage.getItem(LEGACY_SAVE_KEY);
    if (legacy) { const migrated = parseProgress(JSON.parse(legacy)); saveProgress(migrated); return migrated; }
  } catch { /* Storage can be unavailable in private mode. */ }
  return structuredClone(EMPTY_PROGRESS);
}

export function saveProgress(progress: Progress): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch { /* Private mode can deny storage. */ }
}

export function addRunToProgress(progress: Progress, kills: number, seconds: number, won: boolean, hero: Hero = 'warden', region = 0): Progress {
  return {
    ...progress,
    seeds: progress.seeds + seedsForRun(kills, won),
    bestKills: Math.max(progress.bestKills, kills),
    bestSeconds: Math.max(progress.bestSeconds, Math.floor(seconds)),
    victories: progress.victories + (won ? 1 : 0),
    bestRegion: Math.max(progress.bestRegion, Math.min(3, region)),
    mastery: { ...progress.mastery, [hero]: progress.mastery[hero] + 1 + Math.min(3, region) + (won ? 1 : 0) },
  };
}

export function unlockThorns(progress: Progress): Progress {
  if (progress.thornsUnlocked || progress.seeds < THORNS_COST) return progress;
  return { ...progress, seeds: progress.seeds - THORNS_COST, thornsUnlocked: true };
}

export function chooseCampKit(progress: Progress, kit: CampKit): Progress {
  if (progress.unlockedKits.includes(kit)) return { ...progress, selectedKit: kit };
  const cost = CAMP_KIT_INFO[kit].cost;
  if (progress.seeds < cost) return progress;
  return { ...progress, seeds: progress.seeds - cost, unlockedKits: [...progress.unlockedKits, kit], selectedKit: kit };
}

// A small deterministic generator allows layouts and interrupted runs to be restored.
export class Rng {
  state: number;
  constructor(seed: number) { this.state = seed >>> 0 || 1; }
  next(): number {
    let x = this.state;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 4294967296;
  }
  between(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }
  range(min: number, max: number): number { return min + this.next() * (max - min); }
}

export interface Clearing { x: number; y: number; radius: number; kind: 'start' | 'ward' | 'shrine' | 'gate' }
export interface RegionLayout { clearings: Clearing[]; seed: number }
const OFFSETS = [[-480, -250], [460, -330], [370, 440], [-440, 420]] as const;
export function generateRegionLayout(seed: number, region: number): RegionLayout {
  const rng = new Rng((seed ^ Math.imul(region + 1, 0x9e3779b9)) >>> 0);
  const positions = OFFSETS.map(([x, y]) => ({ x: 900 + x + rng.between(-75, 75), y: 900 + y + rng.between(-75, 75) }));
  for (let i = positions.length - 1; i > 0; i--) { const j = rng.between(0, i); [positions[i], positions[j]] = [positions[j], positions[i]]; }
  return {
    seed,
    clearings: [
      { x: 900, y: 900, radius: 280, kind: 'start' },
      ...positions.slice(0, 2).map(position => ({ ...position, radius: 205, kind: 'ward' as const })),
      { ...positions[2], radius: 190, kind: 'shrine' },
      { ...positions[3], radius: 230, kind: 'gate' },
    ],
  };
}
