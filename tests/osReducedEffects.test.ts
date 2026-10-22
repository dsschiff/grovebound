import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EMPTY_PROGRESS, effectiveReducedEffects, osPrefersReducedMotion, parseProgress } from '../src/game/logic';

const osWindow = (reduce: boolean) => ({
  matchMedia: (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' && reduce }),
});

describe('OS reduced-motion default for Reduced effects', () => {
  it('unset + OS reduce: starts on', () => {
    const progress = parseProgress({});
    expect(progress.reducedEffectsSet).toBe(false);
    expect(effectiveReducedEffects(progress, osPrefersReducedMotion(osWindow(true)))).toBe(true);
  });

  it('unset + OS no-preference: starts off', () => {
    expect(effectiveReducedEffects(parseProgress({}), osPrefersReducedMotion(osWindow(false)))).toBe(false);
  });

  it('explicit off beats OS reduce, explicit on beats OS no-preference', () => {
    const off = parseProgress({ reducedEffects: false, reducedEffectsSet: true });
    const on = parseProgress({ reducedEffects: true, reducedEffectsSet: true });
    expect(effectiveReducedEffects(off, osPrefersReducedMotion(osWindow(true)))).toBe(false);
    expect(effectiveReducedEffects(on, osPrefersReducedMotion(osWindow(false)))).toBe(true);
  });

  it('the stored choice survives a save round trip', () => {
    const chosen = { ...EMPTY_PROGRESS, reducedEffects: false, reducedEffectsSet: true };
    const again = parseProgress(JSON.parse(JSON.stringify(chosen)));
    expect(again.reducedEffectsSet).toBe(true);
    expect(effectiveReducedEffects(again, true)).toBe(false);
  });

  it('old saves: a stored true is kept as a choice, a stored false follows the OS', () => {
    expect(effectiveReducedEffects(parseProgress({ reducedEffects: true }), false)).toBe(true);
    expect(effectiveReducedEffects(parseProgress({ reducedEffects: false }), true)).toBe(true);
  });

  it('the frozen v1 fixture loads with the setting unset', () => {
    const blob = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'progress-v1-60abfba.json'), 'utf8')).blob;
    const progress = parseProgress(blob);
    expect(progress.seeds).toBe(14);
    expect(progress.reducedEffects).toBe(false);
    expect(progress.reducedEffectsSet).toBe(false);
  });

  it('is safe with no window or no matchMedia, and when matchMedia throws', () => {
    expect(osPrefersReducedMotion(undefined)).toBe(false);
    expect(osPrefersReducedMotion({})).toBe(false);
    expect(osPrefersReducedMotion({ matchMedia: () => { throw new Error('nope'); } })).toBe(false);
  });
});
