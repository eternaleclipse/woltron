/**
 * Pack rotation strategies — pure functions (inject `rng` for tests).
 */
import type { ID, Pack, PackPreview } from '@woltron/shared';
import { PACK_HISTORY_CAP } from './config.js';

export type Rng = () => number; // [0, 1)

export interface PackPick {
  presetId: ID;
  /** New round-robin cursor (unchanged for other strategies). */
  cursor: number;
  /** For `fresh`: how many recent picks were actually excluded (may be < avoidRepeats when degraded). */
  excluded?: number;
}

type PackLike = Pick<Pack, 'members' | 'strategy' | 'avoidRepeats' | 'cursor' | 'history'>;

const clampWeight = (w: number) => (Number.isFinite(w) ? Math.min(5, Math.max(1, Math.round(w))) : 1);

/** Members that still point to an existing preset (deduped, order preserved). */
export function eligibleMembers(pack: PackLike, exists?: (presetId: ID) => boolean) {
  const seen = new Set<ID>();
  return pack.members.filter((m) => {
    if (seen.has(m.presetId)) return false;
    seen.add(m.presetId);
    return exists ? exists(m.presetId) : true;
  });
}

/**
 * For `fresh`: the candidate set after excluding the last `avoidRepeats` picks. Degrades
 * gracefully — if everything would be excluded, shrink the window until something is left.
 */
export function freshCandidates(pack: PackLike, members: ID[]): { candidates: ID[]; excluded: number } {
  const want = Math.max(0, Math.floor(pack.avoidRepeats || 0));
  for (let n = Math.min(want, pack.history.length); n > 0; n--) {
    const recent = new Set(pack.history.slice(0, n).map((h) => h.presetId));
    const candidates = members.filter((id) => !recent.has(id));
    if (candidates.length > 0) return { candidates, excluded: n };
  }
  return { candidates: members, excluded: 0 };
}

function pickUniform<T>(items: T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

function pickWeighted<T>(items: Array<{ value: T; weight: number }>, rng: Rng): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const i of items) {
    r -= i.weight;
    if (r < 0) return i.value;
  }
  return items[items.length - 1]!.value;
}

export function pickPreset(pack: PackLike, opts: { rng?: Rng; exists?: (id: ID) => boolean } = {}): PackPick {
  const rng = opts.rng ?? Math.random;
  const members = eligibleMembers(pack, opts.exists);
  if (members.length === 0) throw new Error('This pack has no presets to pick from');
  const cursor = pack.cursor || 0;
  switch (pack.strategy) {
    case 'round-robin': {
      const idx = ((cursor % members.length) + members.length) % members.length;
      return { presetId: members[idx]!.presetId, cursor: idx + 1 };
    }
    case 'weighted':
      return {
        presetId: pickWeighted(members.map((m) => ({ value: m.presetId, weight: clampWeight(m.weight) })), rng),
        cursor,
      };
    case 'fresh': {
      const { candidates, excluded } = freshCandidates(pack, members.map((m) => m.presetId));
      return { presetId: pickUniform(candidates, rng), cursor, excluded };
    }
    case 'shuffle':
    default:
      return { presetId: pickUniform(members, rng).presetId, cursor };
  }
}

export function previewPack(pack: PackLike & { id: ID }, exists?: (id: ID) => boolean): PackPreview {
  const members = eligibleMembers(pack, exists);
  const base: PackPreview = { packId: pack.id, strategy: pack.strategy, odds: [] };
  if (members.length === 0) return base;
  switch (pack.strategy) {
    case 'round-robin': {
      const { presetId } = pickPreset(pack, { exists });
      return { ...base, nextUp: presetId, odds: members.map((m) => ({ presetId: m.presetId, probability: m.presetId === presetId ? 1 : 0 })) };
    }
    case 'weighted': {
      const total = members.reduce((s, m) => s + clampWeight(m.weight), 0);
      return { ...base, odds: members.map((m) => ({ presetId: m.presetId, probability: clampWeight(m.weight) / total })) };
    }
    case 'fresh': {
      const { candidates } = freshCandidates(pack, members.map((m) => m.presetId));
      const set = new Set(candidates);
      const odds = members.map((m) => ({ presetId: m.presetId, probability: set.has(m.presetId) ? 1 / candidates.length : 0 }));
      return { ...base, nextUp: candidates.length === 1 ? candidates[0] : undefined, odds };
    }
    case 'shuffle':
    default:
      return { ...base, odds: members.map((m) => ({ presetId: m.presetId, probability: 1 / members.length })) };
  }
}

/** Returns the pack fields to update after a pick (history newest-first, capped). */
export function recordPick(pack: Pack, pick: PackPick, at: string, runId?: ID): Pick<Pack, 'cursor' | 'history'> {
  return {
    cursor: pick.cursor,
    history: [{ presetId: pick.presetId, at, ...(runId ? { runId } : {}) }, ...pack.history].slice(0, PACK_HISTORY_CAP),
  };
}
