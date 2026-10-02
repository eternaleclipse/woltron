import { describe, expect, it } from 'vitest';
import type { Pack } from '@woltron/shared';
import { freshCandidates, pickPreset, previewPack, recordPick } from '../src/packs.js';

const pack = (over: Partial<Pack> = {}): Pack => ({
  id: 'pk',
  name: 'P',
  emoji: '🐕',
  color: 'amber',
  members: [
    { presetId: 'a', weight: 1 },
    { presetId: 'b', weight: 3 },
    { presetId: 'c', weight: 1 },
  ],
  strategy: 'shuffle',
  avoidRepeats: 1,
  cursor: 0,
  history: [],
  favorite: false,
  createdAt: '',
  updatedAt: '',
  runCount: 0,
  ...over,
});

/** Deterministic RNG returning the given values in order (cycled). */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length]!;
};

describe('shuffle', () => {
  it('picks uniformly by rng', () => {
    expect(pickPreset(pack(), { rng: seq(0) }).presetId).toBe('a');
    expect(pickPreset(pack(), { rng: seq(0.5) }).presetId).toBe('b');
    expect(pickPreset(pack(), { rng: seq(0.9999) }).presetId).toBe('c');
  });
  it('odds are uniform', () => {
    const p = previewPack(pack());
    expect(p.odds.map((o) => o.probability)).toEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(p.nextUp).toBeUndefined();
  });
});

describe('weighted', () => {
  const p = pack({ strategy: 'weighted' }); // weights 1,3,1 → total 5
  it('respects weights', () => {
    expect(pickPreset(p, { rng: seq(0.1) }).presetId).toBe('a'); // 0.5 < 1
    expect(pickPreset(p, { rng: seq(0.3) }).presetId).toBe('b'); // 1.5 in [1,4)
    expect(pickPreset(p, { rng: seq(0.79) }).presetId).toBe('b'); // 3.95
    expect(pickPreset(p, { rng: seq(0.85) }).presetId).toBe('c'); // 4.25
  });
  it('odds are proportional to weight', () => {
    expect(previewPack(p).odds.map((o) => o.probability)).toEqual([0.2, 0.6, 0.2]);
  });
  it('clamps silly weights to 1..5', () => {
    const q = pack({ strategy: 'weighted', members: [{ presetId: 'a', weight: 0 }, { presetId: 'b', weight: 99 }] });
    expect(previewPack(q).odds.map((o) => o.probability)).toEqual([1 / 6, 5 / 6]);
  });
  it('distribution roughly matches over many picks', () => {
    let s = 42;
    const rng = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 5000; i++) counts[pickPreset(p, { rng }).presetId]!++;
    expect(counts.b! / 5000).toBeGreaterThan(0.55);
    expect(counts.b! / 5000).toBeLessThan(0.65);
  });
});

describe('round-robin', () => {
  it('cycles deterministically and advances the cursor', () => {
    let p = pack({ strategy: 'round-robin' });
    const picks: string[] = [];
    for (let i = 0; i < 5; i++) {
      const pick = pickPreset(p);
      picks.push(pick.presetId);
      p = { ...p, ...recordPick(p, pick, `t${i}`) };
    }
    expect(picks).toEqual(['a', 'b', 'c', 'a', 'b']);
    expect(p.history[0]!.presetId).toBe('b');
  });
  it('preview shows nextUp', () => {
    const pv = previewPack(pack({ strategy: 'round-robin', cursor: 4 }));
    expect(pv.nextUp).toBe('b');
    expect(pv.odds.find((o) => o.presetId === 'b')!.probability).toBe(1);
  });
  it('skips deleted presets', () => {
    const pick = pickPreset(pack({ strategy: 'round-robin', cursor: 0 }), { exists: (id) => id !== 'a' });
    expect(pick.presetId).toBe('b');
  });
});

describe('fresh', () => {
  const hist = (...ids: string[]) => ids.map((presetId, i) => ({ presetId, at: `t${i}` }));
  it('excludes the last N picks', () => {
    const p = pack({ strategy: 'fresh', avoidRepeats: 2, history: hist('a', 'b') });
    expect(freshCandidates(p, ['a', 'b', 'c'])).toEqual({ candidates: ['c'], excluded: 2 });
    expect(pickPreset(p, { rng: seq(0) }).presetId).toBe('c');
    const pv = previewPack(p);
    expect(pv.nextUp).toBe('c');
    expect(pv.odds.map((o) => o.probability)).toEqual([0, 0, 1]);
  });
  it('degrades gracefully when everything would be excluded', () => {
    const p = pack({ strategy: 'fresh', avoidRepeats: 5, history: hist('c', 'b', 'a') });
    // window 3 excludes all → shrink to 2 (c,b) → only 'a' left
    expect(freshCandidates(p, ['a', 'b', 'c'])).toEqual({ candidates: ['a'], excluded: 2 });
  });
  it('single-member pack always picks that member', () => {
    const p = pack({ strategy: 'fresh', avoidRepeats: 3, members: [{ presetId: 'x', weight: 1 }], history: hist('x', 'x') });
    expect(pickPreset(p, { rng: seq(0.7) })).toMatchObject({ presetId: 'x', excluded: 0 });
  });
  it('never repeats back-to-back with avoidRepeats=1', () => {
    let p = pack({ strategy: 'fresh', avoidRepeats: 1 });
    let s = 7;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    let prev = '';
    for (let i = 0; i < 200; i++) {
      const pick = pickPreset(p, { rng });
      expect(pick.presetId).not.toBe(prev);
      prev = pick.presetId;
      p = { ...p, ...recordPick(p, pick, `t${i}`) };
    }
    expect(p.history.length).toBe(50); // capped
  });
});

it('throws on an empty pack', () => {
  expect(() => pickPreset(pack({ members: [] }))).toThrow(/no presets/);
  expect(previewPack(pack({ members: [] })).odds).toEqual([]);
});
