/**
 * Item sheet: option picker (respects min/max) → quantity → add to an existing or new preset,
 * or "order just this" (creates a small preset and opens the run sheet).
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { Check, ChevronLeft, Plus, Star } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import type { ChosenOption, MenuItem, Preset, PresetItem, Venue } from '@woltron/shared';
import { usePresets, useSavePreset, toPresetInput } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { cn, fmtShort, presetTotal, uid } from '@/lib/utils';
import { Sheet } from './ui/sheet';
import { Button } from './ui/button';
import { SmartImage, Stepper } from './ui/controls';
import { Badge, Input } from './ui/primitives';
import { Collage } from './bits';
import { useRunLauncher } from './run-launcher';
import { EmojiPicker } from './emoji-picker';

export function defaultOptions(item: MenuItem): ChosenOption[] {
  return item.options
    .map((g) => {
      const defs = g.values.filter((v) => v.isDefault).map((v) => v.id);
      const pick = defs.length ? defs : g.min > 0 ? g.values.slice(0, g.min).map((v) => v.id) : [];
      return { groupId: g.id, valueIds: pick };
    })
    .filter((o) => o.valueIds.length > 0);
}

export function buildPresetItem(item: MenuItem, venue: Pick<Venue, 'id' | 'slug' | 'name'>, quantity: number, options: ChosenOption[]): PresetItem {
  let extra = 0;
  const names: string[] = [];
  for (const o of options) {
    const g = item.options.find((x) => x.id === o.groupId);
    for (const vid of o.valueIds) {
      const v = g?.values.find((x) => x.id === vid);
      if (v) {
        extra += v.price.amount;
        names.push(v.name);
      }
    }
  }
  return {
    key: uid('pi_'),
    venueId: venue.id,
    venueSlug: venue.slug,
    venueName: venue.name,
    itemId: item.id,
    name: item.name,
    image: item.image,
    unitPrice: { amount: item.price.amount + extra, currency: item.price.currency },
    quantity,
    options,
    optionSummary: names.join(', ') || undefined,
  };
}

export function ItemSheet({
  item,
  venue,
  open,
  onOpenChange,
  initialStep = 'options',
}: {
  item: MenuItem | null;
  venue: Venue | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialStep?: 'options' | 'preset';
}) {
  const [opts, setOpts] = useState<ChosenOption[]>([]);
  const [qty, setQty] = useState(1);
  const [step, setStep] = useState<'options' | 'preset'>('options');
  const save = useSavePreset();
  const { launch } = useRunLauncher();

  useEffect(() => {
    if (item && open) {
      setOpts(defaultOptions(item));
      setQty(1);
      const needsChoice = item.options.some((g) => g.min > 0 && !g.values.some((v) => v.isDefault));
      setStep(initialStep === 'preset' && !needsChoice ? 'preset' : 'options');
    }
  }, [item, open, initialStep]);

  const invalid = useMemo(() => {
    if (!item) return [];
    return item.options.filter((g) => {
      const n = opts.find((o) => o.groupId === g.id)?.valueIds.length ?? 0;
      return n < g.min || (g.max > 0 && n > g.max);
    });
  }, [item, opts]);

  if (!item || !venue) return null;
  const pi = buildPresetItem(item, venue, qty, opts);
  const lineTotal = { amount: pi.unitPrice.amount * qty, currency: pi.unitPrice.currency };

  const toggle = (groupId: string, valueId: string, max: number) => {
    setOpts((prev) => {
      const cur = prev.find((o) => o.groupId === groupId)?.valueIds ?? [];
      let next: string[];
      if (cur.includes(valueId)) next = cur.filter((v) => v !== valueId);
      else if (max === 1) next = [valueId];
      else if (max > 0 && cur.length >= max) next = [...cur.slice(1), valueId];
      else next = [...cur, valueId];
      const rest = prev.filter((o) => o.groupId !== groupId);
      return next.length ? [...rest, { groupId, valueIds: next }] : rest;
    });
  };

  const orderNow = async () => {
    try {
      const p = await save.mutateAsync({
        input: { name: item.name, emoji: '🎾', color: 'ball', items: [pi], tags: ['fetched'], favorite: false, description: `Fetched from ${venue.name}` },
      });
      onOpenChange(false);
      setTimeout(() => launch({ kind: 'preset', id: p.id }, { source: 'fetch' }), 120);
    } catch (e) {
      toast.error('Couldn’t set that up', { description: errorMessage(e) });
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={step === 'options' ? item.name : 'Add to which preset?'}
      description={step === 'options' ? venue.name : `${qty}× ${item.name}${pi.optionSummary ? `, ${pi.optionSummary}` : ''}`}
      hero={step === 'options' && item.image ? <SmartImage src={item.image} blurhash={item.blurhash} alt="" width={900} className="h-48 w-full shrink-0 lg:h-60" /> : undefined}
      footer={
        step === 'options' ? (
          <>
            <Stepper value={qty} onChange={setQty} min={1} />
            <div className="flex min-w-0 flex-1 justify-end gap-2">
              <Button variant="soft" size="lg" className="px-4 max-sm:flex-1" onClick={orderNow} disabled={invalid.length > 0 || save.isPending}>
                Order this
              </Button>
              <Button variant="ball" size="lg" className="px-4 max-sm:flex-1" onClick={() => setStep('preset')} disabled={invalid.length > 0}>
                Add <span className="tabular">{fmtShort(lineTotal)}</span>
              </Button>
            </div>
          </>
        ) : undefined
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {step === 'options' ? (
          <motion.div key="o" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-6">
            {item.description && <p className="text-[15px] leading-relaxed text-ink-2">{item.description}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <span className="tabular font-display text-2xl font-bold">{fmtShort(item.price)}</span>
              {item.dietary?.map((d) => (
                <Badge key={d} tone="mint">
                  {d}
                </Badge>
              ))}
              {!item.available && <Badge tone="danger">Sold out right now</Badge>}
            </div>
            {item.options.map((g) => {
              const chosen = opts.find((o) => o.groupId === g.id)?.valueIds ?? [];
              const rule = g.min > 0 && g.max === g.min ? `Pick ${g.min}` : g.min > 0 ? `Pick at least ${g.min}${g.max ? `, up to ${g.max}` : ''}` : g.max > 0 ? `Optional, up to ${g.max}` : 'Optional';
              const bad = invalid.includes(g);
              return (
                <fieldset key={g.id}>
                  <legend className="mb-2 flex w-full items-baseline justify-between gap-3">
                    <span className="font-semibold">{g.name}</span>
                    <span className={cn('text-xs font-semibold', bad ? 'text-tongue-ink' : 'text-ink-3')}>{rule}</span>
                  </legend>
                  <div className="space-y-1.5">
                    {g.values.map((v) => {
                      const on = chosen.includes(v.id);
                      const radio = g.max === 1;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          role={radio ? 'radio' : 'checkbox'}
                          aria-checked={on}
                          onClick={() => toggle(g.id, v.id, g.max)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-sm border px-3.5 py-3 text-left text-[15px] transition-[border-color,background-color] duration-150',
                            on ? 'border-ink bg-ball-soft' : 'border-line hover:border-line-strong',
                          )}
                        >
                          <span
                            className={cn(
                              'grid size-5 shrink-0 place-items-center border-2 transition-colors',
                              radio ? 'rounded-full' : 'rounded-[6px]',
                              on ? 'border-ink bg-ink text-bg' : 'border-line-strong',
                            )}
                          >
                            {on && <Check className="size-3" strokeWidth={3.5} />}
                          </span>
                          <span className="flex-1">{v.name}</span>
                          {v.price.amount > 0 && <span className="tabular text-[13px] text-ink-2">+{fmtShort(v.price)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </motion.div>
        ) : (
          <motion.div key="p" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}>
            <PresetPicker
              item={pi}
              onBack={item.options.length ? () => setStep('options') : undefined}
              onDone={() => onOpenChange(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}

function PresetPicker({ item, onBack, onDone }: { item: PresetItem; onBack?: () => void; onDone: () => void }) {
  const { data: presets } = usePresets();
  const navigate = useNavigate();
  const save = useSavePreset();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🍱');

  const addTo = async (p: Preset) => {
    // merge if same item+options already in preset
    const same = p.items.find((x) => x.itemId === item.itemId && JSON.stringify(x.options) === JSON.stringify(item.options));
    const items = same ? p.items.map((x) => (x === same ? { ...x, quantity: x.quantity + item.quantity } : x)) : [...p.items, item];
    try {
      await save.mutateAsync({ id: p.id, input: { ...toPresetInput(p), items } });
      toast.success(`Added to ${p.emoji} ${p.name}`, {
        description: `${item.quantity}× ${item.name}`,
        action: { label: 'Open', onClick: () => navigate(`/presets/${p.id}`) },
      });
      onDone();
    } catch (e) {
      toast.error('Couldn’t add it', { description: errorMessage(e) });
    }
  };

  const create = async () => {
    try {
      const p = await save.mutateAsync({
        input: { name: name.trim() || item.name, emoji, color: 'ball', items: [item], tags: [], favorite: false },
      });
      toast.success(`New preset: ${p.emoji} ${p.name}`, { description: 'Saved to your kennel.' });
      onDone();
    } catch (e) {
      toast.error('Couldn’t create preset', { description: errorMessage(e) });
    }
  };

  return (
    <div className="space-y-4">
      {onBack && (
        <button onClick={onBack} className="-mt-1 flex items-center gap-1 text-sm font-semibold text-ink-2 hover:text-ink">
          <ChevronLeft className="size-4" /> Options
        </button>
      )}

      {creating ? (
        <div className="space-y-4 rounded-lg border border-line bg-surface-2 p-4">
          <div className="flex items-center gap-3">
            <EmojiPicker value={emoji} onChange={setEmoji} />
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={item.name} aria-label="Preset name" onKeyDown={(e) => e.key === 'Enter' && create()} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Back
            </Button>
            <Button variant="ball" onClick={create} loading={save.isPending}>
              Create preset
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex w-full items-center gap-3 rounded-lg border-2 border-dashed border-line-strong p-3 text-left font-semibold text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
        >
          <span className="grid size-12 place-items-center rounded-[14px] bg-ball text-ball-ink">
            <Plus className="size-5" />
          </span>
          New preset
        </button>
      )}

      <ul className="space-y-1.5">
        {presets?.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => addTo(p)}
              disabled={save.isPending}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <Collage preset={p} className="size-12 shrink-0" rounded="rounded-[14px]" showEmoji={false} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate font-semibold">
                  {p.emoji} {p.name} {p.favorite && <Star className="size-3.5 fill-biscuit text-biscuit" />}
                </span>
                <span className="text-[13px] text-ink-3">
                  {p.items.length} items, {fmtShort(presetTotal(p))}
                </span>
              </span>
              <Plus className="size-5 text-ink-3" />
            </button>
          </li>
        ))}
      </ul>
      {!presets?.length && (
        <p className="text-center text-sm text-ink-3">
          No presets yet. <Link to="/presets/new">Make one</Link> or create it right here.
        </p>
      )}
    </div>
  );
}
