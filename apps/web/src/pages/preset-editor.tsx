import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { ArrowLeft, Check, Plus, Store, Trash2 } from 'lucide-react';
import type { Money, PresetInput, PresetItem } from '@woltron/shared';
import { useDeletePreset, usePreset, useSavePreset, toPresetInput } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { cn, colorHex, fmtShort, groupByVenue, presetTotal, PRESET_COLORS, colorId } from '@/lib/utils';
import { Collage, EmptyState, ErrorState } from '@/components/bits';
import { EmojiPicker } from '@/components/emoji-picker';
import { useRunLauncher } from '@/components/run-launcher';
import { Button } from '@/components/ui/button';
import { Card, Field, Skeleton, SwitchRow, Textarea } from '@/components/ui/primitives';
import { SmartImage, Stepper } from '@/components/ui/controls';

const EMPTY: PresetInput = { name: '', emoji: '🍱', color: 'ball', items: [], tags: [], favorite: false };
const TIPS = [0, 500, 1000, 1500, 2000];

export function PresetEditorPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const { data, isLoading, isError, error } = usePreset(isNew ? undefined : id);
  const [draft, setDraft] = useState<PresetInput>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const save = useSavePreset();
  const del = useDeletePreset();
  const navigate = useNavigate();
  const { launch } = useRunLauncher();

  useEffect(() => {
    if (data) {
      setDraft(toPresetInput(data));
      setDirty(false);
    }
  }, [data]);

  const set = <K extends keyof PresetInput>(k: K, v: PresetInput[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };
  const setItem = (key: string, patch: Partial<PresetItem>) =>
    set(
      'items',
      draft.items.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    );
  const removeItem = (key: string) => set('items', draft.items.filter((i) => i.key !== key));

  const groups = useMemo(() => groupByVenue(draft.items), [draft.items]);
  const currency = draft.items[0]?.unitPrice.currency ?? 'ILS';
  const total = presetTotal(draft);

  const onSave = async () => {
    try {
      const p = await save.mutateAsync({ id: isNew ? undefined : id, input: { ...draft, name: draft.name.trim() || 'Untitled preset' } });
      setDirty(false);
      toast.success(isNew ? `Saved ${p.emoji} ${p.name}` : 'Saved', { description: isNew ? 'Find it on your Kennel any time.' : undefined });
      if (isNew) navigate(`/presets/${p.id}`, { replace: true });
    } catch (e) {
      toast.error('Couldn’t save', { description: errorMessage(e) });
    }
  };

  if (!isNew && isLoading)
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Skeleton className="h-16 w-2/3" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  if (!isNew && (isError || !data)) return <ErrorState error={error} />;

  return (
    <div>
      <Link to="/presets" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" /> Presets
      </Link>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px] lg:gap-8">
        <div className="min-w-0 space-y-6">
          {/* Identity */}
          <div className="flex items-center gap-3">
            <EmojiPicker value={draft.emoji} onChange={(e) => set('emoji', e)} size="lg" />
            <label htmlFor="preset-name" className="sr-only">
              Preset name
            </label>
            <input
              id="preset-name"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Name this preset"
              className="min-w-0 flex-1 rounded-sm bg-transparent font-display text-[34px] font-extrabold leading-tight tracking-tight text-ink outline-none placeholder:text-ink-3 focus-visible:bg-surface-2 lg:text-[44px]"
              style={{ fontStretch: '88%' }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Accent colour">
            {PRESET_COLORS.map((c) => (
              <button
                key={c.id}
                role="radio"
                aria-checked={colorId(draft.color) === c.id}
                aria-label={c.name}
                title={c.name}
                onClick={() => set('color', c.id)}
                className={cn(
                  'grid size-8 place-items-center rounded-full transition-transform duration-200 ease-[var(--ease-spring)] hover:scale-110',
                  colorId(draft.color) === c.id && 'ring-2 ring-ink ring-offset-2 ring-offset-bg',
                )}
                style={{ background: c.hex }}
              >
                {colorId(draft.color) === c.id && <Check className="size-4 text-[#2b1a33]" strokeWidth={3} />}
              </button>
            ))}
          </div>
          <Textarea value={draft.description ?? ''} onChange={(e) => set('description', e.target.value || undefined)} placeholder="A note for future you (optional)" className="min-h-0" rows={2} aria-label="Description" />

          {/* Items by venue */}
          <div>
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="font-display text-xl font-bold">What’s in the bowl</h2>
              <Button variant="soft" size="sm" asChild>
                <Link to="/explore">
                  <Plus /> Add items
                </Link>
              </Button>
            </div>
            {groups.length > 1 && (
              <p className="mb-3 rounded-sm bg-plum-soft px-3 py-2 text-[13px] text-plum-ink">
                This preset spans <strong>{groups.length} restaurants</strong>, so each run places {groups.length} separate Wolt orders, one per restaurant.
              </p>
            )}
            {groups.length === 0 ? (
              <Card className="p-2">
                <EmptyState
                  compact
                  mascot="sniffing"
                  title="Empty bowl"
                  action={
                    <Button variant="ball" asChild>
                      <Link to="/explore">Browse restaurants</Link>
                    </Button>
                  }
                >
                  Add dishes from any restaurant. Mixing places is fine.
                  {isNew && ' Save first so you can add items to it.'}
                </EmptyState>
              </Card>
            ) : (
              <div className="space-y-4">
                {groups.map((g, gi) => {
                  const sub: Money = { amount: g.items.reduce((s, i) => s + i.unitPrice.amount * i.quantity, 0), currency };
                  return (
                    <Card key={g.venueId} className="overflow-hidden">
                      <div className="flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-3">
                        {groups.length > 1 && (
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-collar font-display text-sm font-bold text-collar-ink" aria-label={`Order ${gi + 1}`}>
                            {gi + 1}
                          </span>
                        )}
                        <Store className="size-4 text-ink-3" />
                        <Link to={`/explore/${g.venueSlug}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">
                          {g.venueName}
                        </Link>
                        <span className="tabular text-sm font-semibold text-ink-2">{fmtShort(sub)}</span>
                      </div>
                      <ul className="divide-y divide-line">
                        <AnimatePresence initial={false}>
                          {g.items.map((it) => (
                            <motion.li
                              key={it.key}
                              layout
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
                              className="overflow-hidden"
                            >
                              <div className="flex items-center gap-3 px-4 py-3">
                                <SmartImage src={it.image} alt="" width={140} className="size-14 shrink-0 rounded-[14px]" />
                                <div className="min-w-0 flex-1">
                                  <div dir="auto" className="line-clamp-2 font-semibold leading-snug">{it.name}</div>
                                  {it.optionSummary && <div className="truncate text-[13px] text-ink-3">{it.optionSummary}</div>}
                                  <div className="tabular text-[13px] text-ink-2">{fmtShort(it.unitPrice)} each</div>
                                </div>
                                <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                                  <Stepper size="sm" value={it.quantity} min={1} onChange={(q) => setItem(it.key, { quantity: q })} />
                                  <button onClick={() => removeItem(it.key)} className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-danger-soft hover:text-danger-ink" aria-label={`Remove ${it.name}`}>
                                    <Trash2 className="size-4" />
                                  </button>
                                </div>
                              </div>
                            </motion.li>
                          ))}
                        </AnimatePresence>
                      </ul>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Delivery */}
          <Card className="space-y-5 p-5">
            <h2 className="font-display text-xl font-bold">Delivery</h2>
            <Field label="Note for the courier" hint="Sent with every order from this preset.">
              <Textarea value={draft.deliveryNote ?? ''} onChange={(e) => set('deliveryNote', e.target.value || undefined)} placeholder="Leave at the door, the dog will guard it" rows={2} />
            </Field>
            <div>
              <div className="mb-2 text-[13px] font-semibold">Courier tip</div>
              <div className="flex flex-wrap gap-2">
                {TIPS.map((t) => {
                  const active = (draft.tip?.amount ?? 0) === t;
                  return (
                    <button
                      key={t}
                      onClick={() => set('tip', t ? { amount: t, currency } : undefined)}
                      aria-pressed={active}
                      className={cn(
                        'tabular h-10 min-w-16 rounded-sm border px-3 text-sm font-semibold transition-colors',
                        active ? 'border-transparent bg-collar text-collar-ink' : 'border-line-strong hover:border-ink-3',
                      )}
                    >
                      {t === 0 ? 'No tip' : fmtShort({ amount: t, currency })}
                    </button>
                  );
                })}
              </div>
            </div>
            <SwitchRow title="Favourite" description="Show it on the Kennel for one-tap runs." checked={draft.favorite} onCheckedChange={(v) => set('favorite', v)} />
          </Card>
        </div>

        {/* Summary rail */}
        <aside className="space-y-4 lg:sticky lg:top-8">
          <Card className="overflow-hidden p-2">
            <Collage preset={draft} className="aspect-[4/3] w-full" rounded="rounded-[22px]" />
            <div className="space-y-2 p-3">
              {groups.map((g) => (
                <div key={g.venueId} className="flex justify-between gap-3 text-sm">
                  <span className="truncate text-ink-2">{g.venueName}</span>
                  <span className="tabular shrink-0">{fmtShort({ amount: g.items.reduce((s, i) => s + i.unitPrice.amount * i.quantity, 0), currency })}</span>
                </div>
              ))}
              {draft.tip && (
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-ink-2">Tip</span>
                  <span className="tabular">{fmtShort(draft.tip)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
                <span className="text-sm font-semibold">Total</span>
                <span className="tabular font-display text-3xl font-extrabold" style={{ textDecorationColor: colorHex(draft.color) }}>
                  {fmtShort(total)}
                </span>
              </div>
              <p className="text-xs text-ink-3">Before delivery and service fees. Prices are rechecked on every run.</p>
            </div>
          </Card>
          <div className="flex gap-2">
            <Button variant={dirty || isNew ? 'collar' : 'soft'} size="lg" className="flex-1 disabled:opacity-100" onClick={onSave} loading={save.isPending} disabled={!dirty && !isNew}>
              {dirty || isNew ? 'Save preset' : <><Check /> Saved</>}
            </Button>
            {!isNew && (
              <Button variant="ball" size="lg" className="flex-1" disabled={draft.items.length === 0 || dirty} onClick={() => launch({ kind: 'preset', id: id! })}>
                Run
              </Button>
            )}
          </div>
          {dirty && !isNew && <p className="text-center text-xs text-ink-3">Save your changes before running.</p>}
          {!isNew && (
            <Button
              variant="ghost"
              className="w-full text-danger-ink hover:bg-danger-soft hover:text-danger-ink"
              onClick={() =>
                del.mutate(id!, {
                  onSuccess: () => {
                    toast(`Deleted ${draft.name}`);
                    navigate('/presets');
                  },
                })
              }
            >
              <Trash2 /> Delete preset
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}
