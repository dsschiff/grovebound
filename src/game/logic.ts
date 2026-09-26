export type Stat = 'speed' | 'regen' | 'attack' | 'defense';
export type Ability = 'axe' | 'thorns';

export interface Stats {
  speed: number;
  regen: number;
  attack: number;
  defense: number;
}

export const BASE_STATS: Stats = {
  speed: 190,
  regen: 0.4,
  attack: 16,
  defense: 0,
};

export const STAT_INFO: Record<Stat, { name: string; icon: string; color: string; description: string }> = {
  speed: { name: 'Fleetfoot', icon: '✦', color: '#8cdddc', description: 'Move 10% faster' },
  regen: { name: 'Heartwood', icon: '♥', color: '#f5ad9e', description: 'Restore 0.6 health each second' },
  attack: { name: 'Keen Edge', icon: '⚔', color: '#f9cf79', description: 'Deal 20% more damage' },
  defense: { name: 'Barkskin', icon: '◆', color: '#afbbf0', description: 'Take 8% less damage' },
};

export function upgradeStat(stats: Stats, stat: Stat): Stats {
  switch (stat) {
    case 'speed': return { ...stats, speed: Math.round(stats.speed * 1.1) };
    case 'regen': return { ...stats, regen: +(stats.regen + 0.6).toFixed(2) };
    case 'attack': return { ...stats, attack: Math.round(stats.attack * 1.2) };
    case 'defense': return { ...stats, defense: Math.min(0.6, +(stats.defense + 0.08).toFixed(2)) };
  }
}

export function damageAfterDefense(raw: number, defense: number): number {
  return Math.max(1, Math.round(raw * (1 - Math.min(0.6, Math.max(0, defense)))));
}

export function xpToNextLevel(level: number): number {
  return 5 + level * 3;
}

export function seedsForRun(kills: number, won: boolean): number {
  return 2 + Math.min(3, Math.floor(kills / 35)) + (won ? 3 : 0);
}

export interface Progress {
  seeds: number;
  thornsUnlocked: boolean;
  bestKills: number;
  bestSeconds: number;
  victories: number;
}

export const EMPTY_PROGRESS: Progress = {
  seeds: 0,
  thornsUnlocked: false,
  bestKills: 0,
  bestSeconds: 0,
  victories: 0,
};

export const THORNS_COST = 6;
export const SAVE_KEY = 'grovebound-progress-v1';

export function readProgress(): Progress {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...EMPTY_PROGRESS };
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return { ...EMPTY_PROGRESS };
    const data = value as Partial<Progress>;
    return {
      seeds: validNumber(data.seeds),
      thornsUnlocked: data.thornsUnlocked === true,
      bestKills: validNumber(data.bestKills),
      bestSeconds: validNumber(data.bestSeconds),
      victories: validNumber(data.victories),
    };
  } catch {
    return { ...EMPTY_PROGRESS };
  }
}

function validNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function saveProgress(progress: Progress): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch { /* Private browsing may deny storage. */ }
}

export function addRunToProgress(progress: Progress, kills: number, seconds: number, won: boolean): Progress {
  return {
    ...progress,
    seeds: progress.seeds + seedsForRun(kills, won),
    bestKills: Math.max(progress.bestKills, kills),
    bestSeconds: Math.max(progress.bestSeconds, Math.floor(seconds)),
    victories: progress.victories + (won ? 1 : 0),
  };
}

export function unlockThorns(progress: Progress): Progress {
  if (progress.thornsUnlocked || progress.seeds < THORNS_COST) return progress;
  return { ...progress, seeds: progress.seeds - THORNS_COST, thornsUnlocked: true };
}
