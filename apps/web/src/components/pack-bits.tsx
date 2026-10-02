import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import type { Pack, PackStrategy, Preset } from '@woltron/shared';
import { cn, colorHex } from '@/lib/utils';
import { useReducedMotion } from '@/lib/prefs';
import { Collage } from './bits';
import { TennisBall } from './brand';
import { Button } from './ui/button';

export const STRATEGIES: Record<PackStrategy, { label: string; explain: string }> = {
  shuffle: { label: 'Shuffle', explain: 'Every preset has the same chance, every time.' },
  weighted: { label: 'Weighted', explain: 'More bones, more often. A 4-bone preset comes up twice as often as a 2-bone one.' },
  'round-robin': { label: 'Round-robin', explain: 'Takes turns in order, then starts over. Totally predictable.' },
  fresh: { label: 'Fresh', explain: 'Random, but skips whatever you had most recently.' },
};

/** Local odds so the editor updates instantly (mirrors the server's pack preview). */
export function computeOdds(pack: Pick<Pack, 'members' | 'strategy' | 'avoidRepeats' | 'cursor' | 'history'>) {
  const m = pack.members;
  if (!m.length) return { odds: [] as Array<{ presetId: string; p: number }>, nextUp: undefined as string | undefined };
  if (pack.strategy === 'round-robin') {
    const next = m[pack.cursor % m.length]!.presetId;
    return { odds: m.map((x) => ({ presetId: x.presetId, p: x.presetId === next ? 1 : 0 })), nextUp: next };
  }
  if (pack.strategy === 'weighted') {
    const t = m.reduce((s, x) => s + x.weight, 0) || 1;
    return { odds: m.map((x) => ({ presetId: x.presetId, p: x.weight / t })), nextUp: undefined };
  }
  if (pack.strategy === 'fresh') {
    const recent = new Set(pack.history.slice(0, pack.avoidRepeats).map((h) => h.presetId));
    const pool = m.filter((x) => !recent.has(x.presetId));
    const eff = pool.length ? pool : m;
    return { odds: m.map((x) => ({ presetId: x.presetId, p: eff.includes(x) ? 1 / eff.length : 0 })), nextUp: undefined };
  }
  return { odds: m.map((x) => ({ presetId: x.presetId, p: 1 / m.length })), nextUp: undefined };
}

export function pickByOdds(odds: Array<{ presetId: string; p: number }>, nextUp?: string) {
  if (nextUp) return nextUp;
  let r = Math.random();
  for (const o of odds) {
    r -= o.p;
    if (r <= 0) return o.presetId;
  }
  return odds[odds.length - 1]?.presetId;
}

export function OddsBars({ odds, presets, highlight }: { odds: Array<{ presetId: string; p: number }>; presets: Preset[]; highlight?: string }) {
  return (
    <ul className="space-y-2.5">
      {odds.map((o) => {
        const p = presets.find((x) => x.id === o.presetId);
        if (!p) return null;
        return (
          <li key={o.presetId} className={cn('transition-opacity', highlight && highlight !== o.presetId && 'opacity-50')}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-semibold">
                {p.emoji} {p.name}
              </span>
              <span className="tabular shrink-0 text-ink-2">{Math.round(o.p * 100)}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-3">
              <motion.div
                className="h-full rounded-full"
                style={{ background: colorHex(p.color) }}
                initial={false}
                animate={{ width: `${Math.max(o.p * 100, o.p > 0 ? 3 : 0)}%` }}
                transition={{ type: 'spring', stiffness: 200, damping: 26 }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const ROW = 76;

/**
 * Slot-machine reel. Spins through the pack and lands on `target`.
 * Purely a preview — it doesn't run anything or move the server cursor.
 */
export function SpinReel({ presets, odds, nextUp, onLanded }: { presets: Preset[]; odds: Array<{ presetId: string; p: number }>; nextUp?: string; onLanded?: (id: string) => void }) {
  const reduce = useReducedMotion();
  const y = useMotionValue(0);
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState<string | undefined>();
  const members = useMemo(() => odds.map((o) => presets.find((p) => p.id === o.presetId)).filter((p): p is Preset => !!p), [odds, presets]);
  const LOOPS = 6;
  const strip = useMemo(() => Array.from({ length: LOOPS + 1 }).flatMap(() => members), [members]);
  const ctrl = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    y.set(0);
    setLanded(undefined);
  }, [members.length, y]);

  const spin = () => {
    if (!members.length) return;
    const target = pickByOdds(odds, nextUp);
    const idx = members.findIndex((m) => m.id === target);
    if (idx < 0) return;
    const finalIndex = LOOPS * members.length + idx;
    setSpinning(true);
    setLanded(undefined);
    ctrl.current?.stop();
    y.set(-((members.length + (Math.abs(y.get() / ROW) % members.length)) * 0));
    const to = -(finalIndex * ROW) + ROW; // centre row in a 3-row window
    if (reduce) {
      y.set(to);
      setSpinning(false);
      setLanded(target);
      onLanded?.(target!);
      return;
    }
    ctrl.current = animate(y, to, {
      duration: 2.6,
      ease: [0.12, 0.8, 0.18, 1.02],
      onComplete: () => {
        setSpinning(false);
        setLanded(target);
        onLanded?.(target!);
      },
    });
  };

  if (!members.length) {
    return <div className="grid h-[228px] place-items-center rounded-lg border-2 border-dashed border-line-strong text-sm text-ink-3">Add presets to spin</div>;
  }

  return (
    <div>
      <div className="relative h-[228px] overflow-hidden rounded-lg border border-line bg-surface-2" aria-live="polite">
        <motion.ul style={{ y }} className="absolute inset-x-0 top-0">
          {strip.map((p, i) => (
            <li key={i} className="flex h-[76px] items-center gap-3 px-4">
              <Collage preset={p} className="size-14 shrink-0" rounded="rounded-[14px]" showEmoji={false} />
              <span className="min-w-0 flex-1 truncate font-display text-lg font-bold">
                {p.emoji} {p.name}
              </span>
            </li>
          ))}
        </motion.ul>
        {/* window chrome */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[76px] bg-gradient-to-b from-surface-2 to-surface-2/0" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[76px] bg-gradient-to-t from-surface-2 to-surface-2/0" />
        <div
          className={cn(
            'pointer-events-none absolute inset-x-2 top-[76px] h-[76px] rounded-md border-2 transition-colors duration-300',
            landed ? 'border-ink shadow-[0_0_0_5px_var(--ball-soft)]' : 'border-ink/25',
          )}
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button variant="ball" size="lg" onClick={spin} disabled={spinning} className="flex-1">
          <TennisBall size={20} spin={spinning} /> {spinning ? 'Spinning…' : landed ? 'Spin again' : 'Spin preview'}
        </Button>
      </div>
      <p className="mt-2 min-h-5 text-center text-[13px] text-ink-2">
        {landed ? (
          <>
            Landed on <strong className="text-ink">{presets.find((p) => p.id === landed)?.name}</strong>
            {nextUp ? ', next in line.' : '. Just a preview, nothing ordered.'}
          </>
        ) : nextUp ? (
          'Round-robin always lands on whoever’s next.'
        ) : (
          'A practice spin with the real odds.'
        )}
      </p>
    </div>
  );
}

/** Fanned stack of preset covers for pack cards. */
export function PackStack({ presets, className, size = 'md' }: { presets: Preset[]; className?: string; size?: 'md' | 'lg' }) {
  const list = presets.slice(0, 3);
  const n = list.length;
  return (
    <div className={cn('relative grid place-items-center overflow-hidden bg-surface-3', className)}>
      <div className={cn('relative', size === 'lg' ? 'h-[72%] w-[48%]' : 'h-[70%] w-[46%]')}>
        {list.map((p, i) => {
          const off = i - (n - 1) / 2;
          return (
            <Collage
              key={p.id}
              preset={p}
              showEmoji={false}
              rounded="rounded-[18px]"
              className="absolute inset-0 shadow-md ring-[3px] ring-surface transition-transform duration-500 ease-[var(--ease-spring)] group-hover:[transform:var(--fan)]"
              style={{
                transform: `rotate(${off * 8}deg) translateX(${off * 28}%)`,
                ['--fan' as string]: `rotate(${off * 13}deg) translateX(${off * 46}%) translateY(-4px)`,
                zIndex: 10 - Math.abs(off) * 2,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
