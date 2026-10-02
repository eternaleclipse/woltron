/**
 * Global "run something" flow. Anything (tiles, cards, ⌘K, deep links) calls
 * `useRunLauncher().launch(target)` and gets the same confirm sheet: what, where, how much, which mode.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { Dices, Store } from 'lucide-react';
import type { OrderMode, RunSource, Target } from '@woltron/shared';
import { usePackPreview, usePacks, usePresets, useSettings, useStartRun } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { cn, fmtShort, groupByVenue, presetTotal } from '@/lib/utils';
import { useReducedMotion } from '@/lib/prefs';
import { Sheet } from './ui/sheet';
import { Button } from './ui/button';
import { Segmented } from './ui/controls';
import { Collage, MODE_META } from './bits';
import { TennisBall } from './brand';
import { Mascot } from './mascot';

interface LaunchOpts {
  source?: RunSource;
}
interface Ctx {
  launch: (t: Target, o?: LaunchOpts) => void;
}
const LauncherCtx = createContext<Ctx>({ launch: () => {} });
export const useRunLauncher = () => useContext(LauncherCtx);

export function RunLauncherProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const [opts, setOpts] = useState<LaunchOpts>({});
  const [open, setOpen] = useState(false);
  const launch = useCallback((t: Target, o: LaunchOpts = {}) => {
    setTarget(t);
    setOpts(o);
    setOpen(true);
  }, []);
  const value = useMemo(() => ({ launch }), [launch]);
  return (
    <LauncherCtx.Provider value={value}>
      {children}
      {target && <RunSheet target={target} source={opts.source} open={open} onOpenChange={setOpen} />}
    </LauncherCtx.Provider>
  );
}

function RunSheet({ target, source, open, onOpenChange }: { target: Target; source?: RunSource; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: settings } = useSettings();
  const { data: presets } = usePresets();
  const { data: packs } = usePacks();
  const { data: preview } = usePackPreview(target.kind === 'pack' ? target.id : undefined);
  const start = useStartRun();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const defaultMode = settings?.orderMode ?? 'dry-run';
  const [mode, setMode] = useState<OrderMode | null>(null);
  const [tossing, setTossing] = useState(false);
  const effMode = mode ?? defaultMode;

  const preset = target.kind === 'preset' ? presets?.find((p) => p.id === target.id) : undefined;
  const pack = target.kind === 'pack' ? packs?.find((p) => p.id === target.id) : undefined;
  const packPresets = pack ? pack.members.map((m) => presets?.find((p) => p.id === m.presetId)).filter((p): p is NonNullable<typeof p> => !!p) : [];
  const nextUp = preview?.nextUp ? presets?.find((p) => p.id === preview.nextUp) : undefined;

  const priceLine = (() => {
    if (preset) return fmtShort(presetTotal(preset));
    if (packPresets.length) {
      const totals = packPresets.map((p) => presetTotal(p).amount);
      const c = presetTotal(packPresets[0]!).currency;
      const lo = Math.min(...totals);
      const hi = Math.max(...totals);
      return lo === hi ? fmtShort({ amount: lo, currency: c }) : `${fmtShort({ amount: lo, currency: c })}–${fmtShort({ amount: hi, currency: c })}`;
    }
    return '—';
  })();

  const modes: OrderMode[] = defaultMode === 'dry-run' ? ['dry-run', 'handoff'] : ['dry-run', defaultMode === 'live' ? 'live' : 'handoff', ...(defaultMode === 'live' ? (['handoff'] as const) : [])];

  const go = async () => {
    setTossing(true);
    try {
      const [run] = await Promise.all([start.mutateAsync({ target, mode: effMode, source: source ?? 'manual', confirm: 'auto' }), new Promise((r) => setTimeout(r, reduce ? 0 : 900))]);
      onOpenChange(false);
      toast.success(effMode === 'dry-run' ? 'Fetching (dry run)…' : 'Fetching…', { description: `${run.presetName} is on the move.` });
      navigate(`/runs/${run.id}`);
    } catch (e) {
      toast.error('Couldn’t start the run', { description: errorMessage(e) });
    } finally {
      setTossing(false);
      setMode(null);
    }
  };

  const name = preset?.name ?? pack?.name ?? '…';
  const emoji = preset?.emoji ?? pack?.emoji ?? '🐶';

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!tossing) onOpenChange(o);
      }}
      title={
        <span className="flex items-center gap-2">
          <span aria-hidden>{emoji}</span> {name}
        </span>
      }
      description={pack ? `A pack of ${packPresets.length} presets. I’ll pick one when you hit go.` : preset ? `${preset.items.length} items from ${groupByVenue(preset.items).length} venue${groupByVenue(preset.items).length > 1 ? 's' : ''}` : undefined}
      size="md"
      hero={
        preset ? (
          <Collage preset={preset} className="h-40 w-full lg:h-48" rounded="rounded-none" showEmoji={false} />
        ) : pack ? (
          <div className="flex h-40 items-center justify-center gap-3 bg-surface-2 lg:h-48">
            {packPresets.slice(0, 4).map((p, i) => (
              <Collage key={p.id} preset={p} className="size-24 shadow-md ring-4 ring-surface" rounded="rounded-[20px]"
                showEmoji={false}
                style={{ transform: `rotate(${(i - 1.5) * 6}deg) translateY(${Math.abs(i - 1.5) * 6}px)` }}
              />
            ))}
          </div>
        ) : undefined
      }
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={() => onOpenChange(false)} disabled={tossing}>
            Not now
          </Button>
          <Button variant="ball" size="lg" onClick={go} loading={false} disabled={tossing || (!preset && !pack)} className="min-w-40">
            <AnimatePresence mode="wait" initial={false}>
              {tossing ? (
                <motion.span key="t" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                  <TennisBall size={18} spin /> Fetching…
                </motion.span>
              ) : (
                <motion.span key="g" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  {effMode === 'dry-run' ? 'Fetch (dry run)' : effMode === 'handoff' ? 'Fill my basket' : `Order · ${priceLine}`}
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </>
      }
    >
      <div className="relative space-y-5">
        <AnimatePresence>{tossing && !reduce && <TossAnimation />}</AnimatePresence>

        {preset && (
          <ul className="space-y-3">
            {groupByVenue(preset.items).map((g) => (
              <li key={g.venueId} className="rounded-md border border-line bg-surface-2 p-3">
                <div className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-ink-2">
                  <Store className="size-3.5" /> {g.venueName}
                </div>
                <ul className="space-y-1">
                  {g.items.map((it) => (
                    <li key={it.key} className="flex items-baseline justify-between gap-3 text-[15px]">
                      <span dir="auto" className="min-w-0 truncate">
                        <span className="tabular font-semibold text-ink-2">{it.quantity}×</span> {it.name}
                      </span>
                      <span className="tabular shrink-0 text-ink-2">{fmtShort({ amount: it.unitPrice.amount * it.quantity, currency: it.unitPrice.currency })}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {pack && (
          <div className="flex items-center gap-3 rounded-md bg-surface-2 p-3 text-[15px]">
            <Dices className="size-5 shrink-0 text-ink-2" />
            {nextUp ? (
              <span>
                Next in line: <strong>{nextUp.emoji} {nextUp.name}</strong>
              </span>
            ) : (
              <span>
                One of {packPresets.map((p) => p.emoji).join(' ')} — picked {pack.strategy === 'weighted' ? 'by bones' : pack.strategy === 'fresh' ? 'avoiding recent repeats' : 'at random'}.
              </span>
            )}
          </div>
        )}

        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[13px] text-ink-2">{pack ? 'Somewhere between' : 'Items + tip, before fees'}</div>
            <div className="tabular font-display text-3xl font-extrabold">{priceLine}</div>
          </div>
          <Mascot state={tossing ? 'happy' : 'idle'} size={64} />
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold">How should I fetch?</div>
          <Segmented<OrderMode>
            value={effMode}
            onChange={setMode}
            className="w-full"
            label="Order mode"
            options={modes.map((m) => ({ value: m, label: MODE_META[m].short, icon: MODE_META[m].icon }))}
          />
          <p className={cn('mt-2 text-[13px]', effMode === 'live' ? 'font-semibold text-tongue-ink' : 'text-ink-2')}>{MODE_META[effMode].explain}</p>
          {defaultMode === 'dry-run' && <p className="mt-1 text-xs text-ink-3">Live ordering is off. Turn it on in Settings when you’re ready.</p>}
        </div>
      </div>
    </Sheet>
  );
}

/** A ball arcs across the sheet — the "throw" before the fetch. */
function TossAnimation() {
  return (
    <motion.div className="pointer-events-none absolute inset-0 z-10" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="absolute left-2 top-full"
        initial={{ x: 0, y: 0, rotate: 0, scale: 0.8 }}
        animate={{ x: [0, 160, 320], y: [0, -180, -20], rotate: 540, scale: [0.8, 1.1, 0.9] }}
        transition={{ duration: 0.85, ease: [0.3, 0.7, 0.4, 1] }}
      >
        <TennisBall size={36} />
      </motion.div>
    </motion.div>
  );
}
