import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Check, Trash2 } from 'lucide-react';
import type { PackInput, PackStrategy } from '@woltron/shared';
import { useDeletePack, usePack, usePresets, useSavePack, toPackInput } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { cn, fmtShort, presetTotal, PRESET_COLORS, relTime } from '@/lib/utils';
import { Collage, ErrorState } from '@/components/bits';
import { Bone } from '@/components/brand';
import { EmojiPicker } from '@/components/emoji-picker';
import { computeOdds, OddsBars, SpinReel, STRATEGIES } from '@/components/pack-bits';
import { useRunLauncher } from '@/components/run-launcher';
import { Button } from '@/components/ui/button';
import { Card, Skeleton, Textarea } from '@/components/ui/primitives';
import { Segmented, Stepper } from '@/components/ui/controls';

const EMPTY: PackInput = { name: '', emoji: '🎲', color: 'lilac', members: [], strategy: 'shuffle', avoidRepeats: 1, favorite: false };

export function PackEditorPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const { data: pack, isLoading, isError, error } = usePack(isNew ? undefined : id);
  const { data: presets } = usePresets();
  const [draft, setDraft] = useState<PackInput>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [landed, setLanded] = useState<string>();
  const save = useSavePack();
  const del = useDeletePack();
  const navigate = useNavigate();
  const { launch } = useRunLauncher();

  useEffect(() => {
    if (pack) {
      setDraft(toPackInput(pack));
      setDirty(false);
    }
  }, [pack]);

  const set = <K extends keyof PackInput>(k: K, v: PackInput[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
    setLanded(undefined);
  };
  const member = (pid: string) => draft.members.find((m) => m.presetId === pid);
  const toggle = (pid: string) =>
    set('members', member(pid) ? draft.members.filter((m) => m.presetId !== pid) : [...draft.members, { presetId: pid, weight: 3 }]);
  const setWeight = (pid: string, w: number) => set('members', draft.members.map((m) => (m.presetId === pid ? { ...m, weight: w } : m)));

  const { odds, nextUp } = useMemo(
    () => computeOdds({ ...draft, cursor: pack?.cursor ?? 0, history: pack?.history ?? [] }),
    [draft, pack?.cursor, pack?.history],
  );

  const onSave = async () => {
    try {
      const p = await save.mutateAsync({ id: isNew ? undefined : id, input: { ...draft, name: draft.name.trim() || 'Untitled pack' } });
      setDirty(false);
      toast.success(isNew ? `Pack ready: ${p.emoji} ${p.name}` : 'Saved');
      if (isNew) navigate(`/packs/${p.id}`, { replace: true });
    } catch (e) {
      toast.error('Couldn’t save', { description: errorMessage(e) });
    }
  };

  if (!isNew && isLoading) return <Skeleton className="h-[480px]" />;
  if (!isNew && (isError || !pack)) return <ErrorState error={error} />;

  return (
    <div>
      <Link to="/packs" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" /> Packs
      </Link>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px] lg:gap-8">
        <div className="min-w-0 space-y-6">
          <div className="flex items-center gap-3">
            <EmojiPicker value={draft.emoji} onChange={(e) => set('emoji', e)} size="lg" />
            <label htmlFor="pack-name" className="sr-only">
              Pack name
            </label>
            <input
              id="pack-name"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Name this pack"
              className="min-w-0 flex-1 rounded-sm bg-transparent font-display text-[34px] font-extrabold leading-tight tracking-tight outline-none placeholder:text-ink-3 focus-visible:bg-surface-2 lg:text-[44px]"
              style={{ fontStretch: '88%' }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Accent colour">
            {PRESET_COLORS.map((c) => (
              <button
                key={c.id}
                role="radio"
                aria-checked={draft.color === c.id}
                aria-label={c.name}
                onClick={() => set('color', c.id)}
                className={cn('grid size-8 place-items-center rounded-full transition-transform hover:scale-110', draft.color === c.id && 'ring-2 ring-ink ring-offset-2 ring-offset-bg')}
                style={{ background: c.hex }}
              >
                {draft.color === c.id && <Check className="size-4 text-[#2b1a33]" strokeWidth={3} />}
              </button>
            ))}
          </div>
          <Textarea value={draft.description ?? ''} onChange={(e) => set('description', e.target.value || undefined)} placeholder="What’s this pack for? (optional)" rows={2} className="min-h-0" aria-label="Description" />

          <Card className="space-y-4 p-5">
            <h2 className="font-display text-xl font-bold">How should I pick?</h2>
            <Segmented<PackStrategy>
              label="Strategy"
              value={draft.strategy}
              onChange={(v) => set('strategy', v)}
              className="flex w-full flex-wrap sm:flex-nowrap"
              options={(Object.keys(STRATEGIES) as PackStrategy[]).map((s) => ({ value: s, label: STRATEGIES[s].label }))}
            />
            <p className="text-[15px] text-ink-2">{STRATEGIES[draft.strategy].explain}</p>
            {draft.strategy === 'fresh' && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-2 p-3">
                <div>
                  <div className="font-semibold">Skip the last</div>
                  <div className="text-[13px] text-ink-2">How many recent picks to avoid</div>
                </div>
                <Stepper value={draft.avoidRepeats} onChange={(v) => set('avoidRepeats', v)} min={1} max={Math.max(1, draft.members.length - 1)} label="Avoid repeats" />
              </div>
            )}
          </Card>

          <div>
            <div className="mb-3 flex items-end justify-between">
              <h2 className="font-display text-xl font-bold">Presets in this pack</h2>
              <span className="text-[13px] text-ink-3">{draft.members.length} picked</span>
            </div>
            <ul className="space-y-2">
              {presets?.map((p) => {
                const m = member(p.id);
                return (
                  <li key={p.id}>
                    <div
                      className={cn(
                        'flex flex-wrap items-center gap-3 rounded-lg border p-2.5 pr-3 transition-[border-color,background-color]',
                        m ? 'border-ink bg-surface shadow-sm' : 'border-line bg-surface/50',
                      )}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={!!m}
                        onClick={() => toggle(p.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span className={cn('grid size-6 shrink-0 place-items-center rounded-[8px] border-2 transition-colors', m ? 'border-ink bg-ink text-bg' : 'border-line-strong')}>
                          {m && <Check className="size-3.5" strokeWidth={3.5} />}
                        </span>
                        <Collage preset={p} className="size-12 shrink-0" rounded="rounded-[12px]" showEmoji={false} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">
                            {p.emoji} {p.name}
                          </span>
                          <span className="tabular text-[13px] text-ink-3">{fmtShort(presetTotal(p))}</span>
                        </span>
                      </button>
                      {m && (
                        <div className={cn('flex items-center gap-0.5', draft.strategy !== 'weighted' && 'opacity-40')} role="radiogroup" aria-label={`Weight for ${p.name}`}>
                          {[1, 2, 3, 4, 5].map((w) => (
                            <button
                              key={w}
                              role="radio"
                              aria-checked={m.weight === w}
                              aria-label={`${w} bone${w > 1 ? 's' : ''}`}
                              title={draft.strategy === 'weighted' ? `${w} bone${w > 1 ? 's' : ''}` : 'Weights only matter for Weighted'}
                              onClick={() => setWeight(p.id, w)}
                              className="rounded-[6px] p-0.5 transition-transform duration-200 ease-[var(--ease-spring)] hover:scale-110 active:scale-90"
                            >
                              <Bone filled={w <= m.weight} className="h-3.5 w-7" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {!presets?.length && (
              <p className="text-sm text-ink-3">
                You need some presets first. <Link to="/presets/new" className="font-semibold underline">Make one</Link>.
              </p>
            )}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-8">
          <Card className="p-5">
            <h2 className="mb-3 font-display text-xl font-bold">Give it a spin</h2>
            <SpinReel presets={presets ?? []} odds={odds} nextUp={nextUp} onLanded={setLanded} />
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-display text-lg font-bold">Odds</h2>
            {odds.length ? <OddsBars odds={odds} presets={presets ?? []} highlight={landed} /> : <p className="text-sm text-ink-3">Pick some presets to see the odds.</p>}
            {pack?.history.length ? (
              <div className="mt-5 border-t border-line pt-4">
                <div className="mb-2 text-[13px] font-semibold">Recent picks</div>
                <ul className="space-y-1 text-[13px] text-ink-2">
                  {pack.history.slice(0, 4).map((h, i) => {
                    const p = presets?.find((x) => x.id === h.presetId);
                    return (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="truncate">
                          {p?.emoji} {p?.name ?? 'Deleted preset'}
                        </span>
                        <span className="shrink-0 text-ink-3">{relTime(h.at)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </Card>
          <div className="flex gap-2">
            <Button variant="collar" size="lg" className="flex-1" onClick={onSave} loading={save.isPending} disabled={!dirty && !isNew}>
              {dirty || isNew ? 'Save pack' : 'Saved'}
            </Button>
            {!isNew && (
              <Button variant="ball" size="lg" className="flex-1" onClick={() => launch({ kind: 'pack', id: id! })} disabled={dirty || !draft.members.length}>
                Run it
              </Button>
            )}
          </div>
          {!isNew && (
            <Button
              variant="ghost"
              className="w-full text-danger-ink hover:bg-danger-soft"
              onClick={() =>
                del.mutate(id!, {
                  onSuccess: () => {
                    toast(`Deleted ${draft.name}`);
                    navigate('/packs');
                  },
                })
              }
            >
              <Trash2 /> Delete pack
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}
