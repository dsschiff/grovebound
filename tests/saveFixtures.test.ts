import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LEGACY_SAVE_KEY, SAVE_KEY, readProgress } from '../src/game/logic';
import { parseRunSnapshot } from '../src/game/runSave';

// Frozen literal saves reproduced from git history. Each file's shapeCommit names the
// commit whose snapshot/progress shape it reproduces. Never regenerate these from current types.
const dir = join(__dirname, 'fixtures');
const load = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const runFixtures = readdirSync(dir).filter(name => name.startsWith('run-'));

describe('frozen save fixtures', () => {
  it('ships a run fixture for each of the three earlier shapes', () => {
    expect([...new Set(runFixtures.map(name => load(name).shapeCommit))].sort()).toEqual(['221d943', '5b613ac', 'b27bab7']);
  });

  it.each(runFixtures)('%s still parses and keeps seed, rngState and unlocks', name => {
    const { snapshot } = load(name);
    const parsed = parseRunSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(parsed).not.toBeNull();
    expect(parsed!.seed).toBe(snapshot.seed);
    expect(parsed!.rngState).toBe(snapshot.rngState);
    expect(parsed!.unlockedWeapons).toEqual(snapshot.unlockedWeapons);
    expect(parsed!.masteryRank).toBe(snapshot.masteryRank);
  });

  it('fills missing optional fields on the oldest run shape', () => {
    const parsed = parseRunSnapshot(load('run-pre-commandchain-b27bab7.json').snapshot)!;
    expect(parsed.kit).toBeUndefined();
    expect(parsed.commandChain).toBeUndefined();
    expect(parsed.quarryRoute).toBeUndefined();
    expect(parsed.metrics.resonances).toBe(0);
    expect(parsed.metrics.chargesEvaded).toBe(0);
  });

  it('keeps the kit and conductor-length command chain from the pre-routes shape', () => {
    const parsed = parseRunSnapshot(load('run-pre-routes-221d943-active-chain.json').snapshot)!;
    expect(parsed.kit).toBe('conductor');
    expect(parsed.commandChain).toEqual({ weapon: 'bow', remaining: 5.5 });
  });

  it('reads the frozen v1 blob from the legacy key and writes a v2 save with defaults for new fields', () => {
    const fixture = load('progress-v1-60abfba.json');
    expect(fixture.storageKey).toBe(LEGACY_SAVE_KEY);
    const values = new Map([[LEGACY_SAVE_KEY, JSON.stringify(fixture.blob)]]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    try {
      const progress = readProgress();
      expect(progress.seeds).toBe(14);
      expect(progress.thornsUnlocked).toBe(true);
      expect(progress.bestSeconds).toBe(412);
      expect(progress.unlockedKits).toEqual(['breaker']);
      expect(progress.heroLook).toBe('expedition');
      expect(JSON.parse(values.get(SAVE_KEY)!).seeds).toBe(14);
    } finally { vi.unstubAllGlobals(); }
  });

  it('accepts a null commandChain, the usual saved state, and keeps it null', () => {
    for (const name of ['run-pre-kit-5b613ac.json', 'run-pre-routes-221d943.json']) {
      expect(parseRunSnapshot(load(name).snapshot)!.commandChain).toBeNull();
    }
  });

  it('returns null without throwing when a field in an old save is corrupt', () => {
    const corrupt = JSON.parse(JSON.stringify(load('run-pre-kit-5b613ac.json').snapshot));
    corrupt.enemies[0].hp = 'NaN';
    expect(() => parseRunSnapshot(corrupt)).not.toThrow();
    expect(parseRunSnapshot(corrupt)).toBeNull();
  });
});
