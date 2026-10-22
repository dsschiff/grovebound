import type { EnemySave } from './runSave';

// Enemy spawn rules that used to sit inline in GroveScene: the per-kind stat table, which kind a
// spawn roll produces, wave pauses, and region/time hp scaling. Random draws stay in the scene so
// the RNG call order is unchanged; these functions take the roll as an argument.

export type EnemyKind = EnemySave['kind'];

export interface EnemyStats { hp: number; speed: number; damage: number; radius: number; size: number; texture: string }

export const ENEMY_STATS: Readonly<Record<EnemyKind, Readonly<EnemyStats>>> = {
  gnarl: { hp: 27, speed: 77, damage: 8, radius: 23, size: 48, texture: 'gnarl-v2' },
  wisp: { hp: 17, speed: 126, damage: 6, radius: 17, size: 43, texture: 'wisp-v2' },
  brute: { hp: 82, speed: 53, damage: 15, radius: 31, size: 67, texture: 'brute-v2' },
  thornback: { hp: 110, speed: 92, damage: 17, radius: 30, size: 74, texture: 'thornback-v1' },
  gatekeeper: { hp: 420, speed: 67, damage: 18, radius: 38, size: 91, texture: 'brute-v2' },
  boss: { hp: 1150, speed: 63, damage: 22, radius: 54, size: 125, texture: 'briar-king-v2' },
};

/** At most this many thornbacks roam at once. */
export const MAX_THORNBACKS = 3;

/** The kind a wave spawn produces for `roll` in [0, 1). */
export function enemyKindForRoll(roll: number, region: number, stageSeconds: number, surge: boolean, thornbacks: number): EnemyKind {
  if (stageSeconds > 40 && roll < 0.12 + region * 0.03 && thornbacks < MAX_THORNBACKS) return 'thornback';
  if (stageSeconds > 55 && roll < 0.26 + region * 0.05) return 'brute';
  if (stageSeconds > 25 && roll < 0.5 + region * 0.05 + (surge ? 0.16 : 0)) return 'wisp';
  return 'gnarl';
}

/** Waves rest for the last 7 s of every 45 s, except during a wild surge. */
export function wavePaused(surge: boolean, stageSeconds: number): boolean {
  return !surge && stageSeconds % 45 > 38;
}

/** Distance from the hero at which a wave enemy appears. */
export function spawnDistance(kind: EnemyKind): number {
  return kind === 'thornback' ? 280 : 430;
}

/** Max hp of a fresh enemy; guardians do not scale with region or stage time. */
export function enemyMaxHp(kind: EnemyKind, region: number, stageSeconds: number): number {
  return Math.round(ENEMY_STATS[kind].hp * (kind === 'boss' || kind === 'gatekeeper' ? 1 : 1 + region * 0.25 + stageSeconds / 700));
}
