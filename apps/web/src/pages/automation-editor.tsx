import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Check, Clock, Copy, Hand, Package, Play, Radio, RefreshCw, Search, Trash2, Zap } from 'lucide-react';
import type { AutomationInput, Trigger } from '@woltron/shared';
import {
  useAutomation, useDeleteAutomation, useDescribeCron, useFireAutomation, usePacks, usePresets, useRotateSecret, useSaveAutomation, useSettings, useVenues, toAutomationInput,
} from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { DAYS, describeSimple, fromCron, TIMEZONE, toCron } from '@/lib/cron';
import { cn, currencySymbol, fmtDateTime, fmtShort, presetTotal } from '@/lib/utils';
import { Collage, ErrorState } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { Card, Field, Input, Skeleton, SwitchRow } from '@/components/ui/primitives';
import { Segmented, SmartImage, Stepper } from '@/components/ui/controls';

type TType = Trigger['type'];

function defaultTrigger(t: TType): Trigger {
  switch (t) {
    case 'schedule':
      return { type: 'schedule', cron: '30 12 * * 1-5', timezone: TIMEZONE };
    case 'once': {
      const d = new Date(Date.now() + 86400000);
      d.setHours(19, 0, 0, 0);
      return { type: 'once', at: d.toISOString() };
    }
    case 'webhook':
      return { type: 'webhook', secret: '' };
    case 'venue-online':
      return { type: 'venue-online', venueSlug: '' };
  }
}

const EMPTY: AutomationInput = {
  name: '',
  enabled: true,
  target: { kind: 'preset', id: '' },
  trigger: defaultTrigger('schedule'),
  confirm: 'ask',
  confirmWindowMin: 10,
  guards: { onlyIfAllVenuesOpen: true },
};

export function AutomationEditorPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const { data, isLoading, isError, error } = useAutomation(isNew ? undefined : id);
  const { data: presets } = usePresets();
  const { data: packs } = usePacks();
  const { data: settings } = useSettings();
  const save = useSaveAutomation();
  const del = useDeleteAutomation();
  const fire = useFireAutomation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<AutomationInput>(EMPTY);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setDraft(toAutomationInput(data));
      setDirty(false);
    }
  }, [data]);
  useEffect(() => {
    if (isNew && presets?.[0] && !draft.target.id) setDraft((d) => ({ ...d, target: { kind: 'preset', id: presets[0]!.id } }));
  }, [isNew, presets, draft.target.id]);

  const set = <K extends keyof AutomationInput>(k: K, v: AutomationInput[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };
  const currency = settings?.limits.maxPerRun?.currency ?? 'ILS';

  const onSave = async () => {
    if (!draft.target.id) return toast.error('Pick what to fetch first');
    if (draft.trigger.type === 'venue-online' && !draft.trigger.venueSlug) return toast.error('Pick a venue to watch');
    try {
      const a = await save.mutateAsync({ id: isNew ? undefined : id, input: { ...draft, name: draft.name.trim() || autoName(draft) } });
      setDirty(false);
      toast.success(isNew ? 'Automation saved' : 'Saved', { description: a.nextFireAt ? `Next fetch ${fmtDateTime(a.nextFireAt)}` : undefined });
      if (isNew) navigate(`/automations/${a.id}`, { replace: true });
    } catch (e) {
      toast.error('Couldn’t save', { description: errorMessage(e) });
    }
  };

  const autoName = (d: AutomationInput) => {
    const t = d.target.kind === 'preset' ? presets?.find((p) => p.id === d.target.id) : packs?.find((p) => p.id === d.target.id);
    return t ? `${t.name} ${d.trigger.type === 'schedule' ? 'on schedule' : d.trigger.type === 'webhook' ? 'by webhook' : d.trigger.type === 'once' ? 'once' : 'when open'}` : 'New automation';
  };

  if (!isNew && isLoading) return <Skeleton className="h-[480px]" />;
  if (!isNew && (isError || !data)) return <ErrorState error={error} />;

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/automations" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" /> Automations
      </Link>
      <label htmlFor="auto-name" className="sr-only">
        Automation name
      </label>
      <input
        id="auto-name"
        value={draft.name}
        onChange={(e) => set('name', e.target.value)}
        placeholder={autoName(draft)}
        className="mb-6 w-full rounded-sm bg-transparent font-display text-[34px] font-extrabold leading-tight tracking-tight outline-none placeholder:text-ink-3 focus-visible:bg-surface-2 lg:text-[44px]"
        style={{ fontStretch: '88%' }}
      />

      <div className="space-y-5">
        <Step n={1} title="When">
          <Segmented<TType>
            label="Trigger type"
            value={draft.trigger.type}
            onChange={(t) => set('trigger', t === draft.trigger.type ? draft.trigger : defaultTrigger(t))}
            className="mb-5 grid w-full grid-cols-2 sm:flex"
            options={[
              { value: 'schedule', label: 'Schedule', icon: <Clock /> },
              { value: 'once', label: 'Once', icon: <Package /> },
              { value: 'webhook', label: 'Webhook', icon: <Zap /> },
              { value: 'venue-online', label: 'Venue opens', icon: <Radio /> },
            ]}
          />
          {draft.trigger.type === 'schedule' && <ScheduleBuilder trigger={draft.trigger} onChange={(t) => set('trigger', t)} />}
          {draft.trigger.type === 'once' && (
            <Field label="Fetch at" hint="Turns itself off after it fires." htmlFor="once-at">
              <Input
                id="once-at"
                type="datetime-local"
                value={toLocalInput(draft.trigger.at)}
                onChange={(e) => e.target.value && set('trigger', { type: 'once', at: new Date(e.target.value).toISOString() })}
                className="max-w-xs"
              />
            </Field>
          )}
          {draft.trigger.type === 'webhook' && <WebhookPanel id={isNew ? undefined : id} secret={data?.trigger.type === 'webhook' ? data.trigger.secret : undefined} />}
          {draft.trigger.type === 'venue-online' && <VenuePicker trigger={draft.trigger} onChange={(t) => set('trigger', t)} />}
        </Step>

        <Step n={2} title="Fetch what">
          <Segmented<'preset' | 'pack'>
            label="Target type"
            value={draft.target.kind}
            onChange={(k) => set('target', { kind: k, id: (k === 'preset' ? presets?.[0]?.id : packs?.[0]?.id) ?? '' })}
            className="mb-4"
            options={[
              { value: 'preset', label: 'A preset' },
              { value: 'pack', label: 'A pack' },
            ]}
          />
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Target">
            {(draft.target.kind === 'preset' ? presets ?? [] : packs ?? []).map((t) => {
              const on = draft.target.id === t.id;
              const cover = 'items' in t ? t : presets?.find((p) => p.id === t.members[0]?.presetId);
              return (
                <button
                  key={t.id}
                  role="radio"
                  aria-checked={on}
                  onClick={() => set('target', { kind: draft.target.kind, id: t.id })}
                  className={cn('flex items-center gap-3 rounded-lg border p-2 text-left transition-[border-color,box-shadow]', on ? 'border-ink shadow-[0_0_0_4px_var(--ball-soft)]' : 'border-line hover:border-line-strong')}
                >
                  {cover ? <Collage preset={cover} className="size-12 shrink-0" rounded="rounded-[12px]" showEmoji={false} /> : <span className="grid size-12 place-items-center text-2xl">{t.emoji}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {t.emoji} {t.name}
                    </span>
                    <span className="text-[13px] text-ink-3">{'items' in t ? fmtShort(presetTotal(t)) : `${t.members.length} presets`}</span>
                  </span>
                  {on && <Check className="mr-1 size-5 text-ink" />}
                </button>
              );
            })}
          </div>
        </Step>

        <Step n={3} title="How">
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Confirmation">
            <PolicyCard on={draft.confirm === 'ask'} onClick={() => set('confirm', 'ask')} icon={<Hand />} title="Ask me first" body="I’ll get everything ready and wait for your OK." />
            <PolicyCard on={draft.confirm === 'auto'} onClick={() => set('confirm', 'auto')} icon={<Zap />} title="Just do it" body="Places the order straight away. Guards still apply." />
          </div>
          {draft.confirm === 'ask' && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-2 p-3">
              <div>
                <div className="font-semibold">Wait for me</div>
                <div className="text-[13px] text-ink-2">Minutes before I give up and skip it</div>
              </div>
              <Stepper value={draft.confirmWindowMin} onChange={(v) => set('confirmWindowMin', v)} min={1} max={120} label="Confirm window minutes" />
            </div>
          )}
        </Step>

        <Step n={4} title="Guards">
          <div className="space-y-4">
            <Field label="Skip if the total is over" hint="Leave empty for no limit. Your global limits in Settings still apply." htmlFor="max-total">
              <div className="relative max-w-[200px]">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">{currencySymbol(currency)}</span>
                <Input
                  id="max-total"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={draft.guards.maxTotal ? draft.guards.maxTotal.amount / 100 : ''}
                  onChange={(e) =>
                    set('guards', { ...draft.guards, maxTotal: e.target.value ? { amount: Math.round(Number(e.target.value) * 100), currency } : undefined })
                  }
                  className="tabular pl-8"
                  placeholder="No limit"
                />
              </div>
            </Field>
            <SwitchRow
              title="Only if every venue is open"
              description="If one place in the preset is closed, skip the whole run instead of ordering half."
              checked={draft.guards.onlyIfAllVenuesOpen}
              onCheckedChange={(v) => set('guards', { ...draft.guards, onlyIfAllVenuesOpen: v })}
            />
            <SwitchRow title="Enabled" description="Paused automations keep their settings." checked={draft.enabled} onCheckedChange={(v) => set('enabled', v)} />
          </div>
        </Step>
      </div>

      <div className="sticky bottom-24 z-10 mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur lg:bottom-6">
        {!isNew && (
          <Button
            variant="ghost"
            className="text-danger-ink hover:bg-danger-soft"
            onClick={() =>
              del.mutate(id!, {
                onSuccess: () => {
                  toast('Deleted');
                  navigate('/automations');
                },
              })
            }
          >
            <Trash2 /> <span className="hidden sm:inline">Delete</span>
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          {!isNew && (
            <Button
              variant="soft"
              disabled={dirty}
              loading={fire.isPending}
              onClick={() =>
                fire.mutate(id!, {
                  onSuccess: (run) => navigate(`/runs/${run.id}`),
                  onError: (e) => toast.error('Couldn’t fire', { description: errorMessage(e) }),
                })
              }
            >
              <Play /> Fire now
            </Button>
          )}
          <Button variant={dirty || isNew ? 'ball' : 'soft'} onClick={onSave} loading={save.isPending} disabled={!dirty && !isNew} className="disabled:opacity-100">
            {dirty || isNew ? 'Save automation' : <><Check /> Saved</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-3 font-display text-xl font-bold">
        <span className="grid size-7 place-items-center rounded-full bg-collar text-sm text-collar-ink">{n}</span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

function PolicyCard({ on, onClick, icon, title, body }: { on: boolean; onClick: () => void; icon: ReactNode; title: string; body: string }) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 rounded-lg border-2 p-4 text-left transition-[border-color,background-color]',
        on ? 'border-ink bg-ball-soft' : 'border-line hover:border-line-strong',
      )}
    >
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-[12px] [&_svg]:size-5', on ? 'bg-collar text-collar-ink' : 'bg-surface-2 text-ink-2')}>{icon}</span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="text-[13px] text-ink-2">{body}</span>
      </span>
    </button>
  );
}

function ScheduleBuilder({ trigger, onChange }: { trigger: Extract<Trigger, { type: 'schedule' }>; onChange: (t: Trigger) => void }) {
  const simple = fromCron(trigger.cron);
  const [advanced, setAdvanced] = useState(!simple);
  const [raw, setRaw] = useState(trigger.cron);
  useEffect(() => setRaw(trigger.cron), [trigger.cron]);
  const { data: desc, isError, isFetching } = useDescribeCron(trigger.cron, trigger.timezone);
  const s = simple ?? { days: [1, 2, 3, 4, 5], time: '12:30' };
  const update = (days: number[], time: string) => onChange({ ...trigger, cron: toCron({ days, time }) });
  const presetsDays: Array<{ label: string; days: number[] }> = [
    { label: 'Weekdays', days: [1, 2, 3, 4, 5] },
    { label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
    { label: 'Weekends', days: [0, 6] },
  ];
  const label = useMemo(() => desc?.label ?? (simple ? describeSimple(simple) : trigger.cron), [desc, simple, trigger.cron]);

  return (
    <div className="space-y-5">
      {!advanced ? (
        <>
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold">On these days</span>
              <div className="flex gap-1">
                {presetsDays.map((p) => (
                  <button key={p.label} onClick={() => update(p.days, s.time)} className="rounded-full px-2.5 py-1 text-xs font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-1.5 sm:gap-2" role="group" aria-label="Days of week">
              {DAYS.map((d) => {
                const on = s.days.includes(d.n);
                return (
                  <button
                    key={d.n}
                    aria-pressed={on}
                    aria-label={d.short}
                    onClick={() => update(on ? s.days.filter((x) => x !== d.n) : [...s.days, d.n], s.time)}
                    className={cn(
                      'grid aspect-square flex-1 place-items-center rounded-full font-display text-base font-bold transition-[background-color,color,transform] duration-200 ease-[var(--ease-spring)] active:scale-90 sm:max-w-14',
                      on ? 'bg-ball text-ball-ink shadow-[0_3px_0_-1px_#a8c22a]' : 'bg-surface-2 text-ink-3 hover:text-ink',
                    )}
                  >
                    <span className="sm:hidden">{d.letter}</span>
                    <span className="hidden text-sm sm:inline">{d.short}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <Field label="At" htmlFor="sched-time">
            <Input id="sched-time" type="time" value={s.time} onChange={(e) => e.target.value && update(s.days, e.target.value)} className="tabular max-w-[160px] text-lg font-semibold" />
          </Field>
        </>
      ) : (
        <Field label="Cron expression" hint="minute hour day-of-month month day-of-week, e.g. 0 9 * * 1" htmlFor="cron-raw" error={isError ? 'I can’t read that one yet.' : undefined}>
          <Input
            id="cron-raw"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onBlur={() => raw.trim() && onChange({ ...trigger, cron: raw.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && raw.trim() && onChange({ ...trigger, cron: raw.trim() })}
            className="tabular font-mono"
            spellCheck={false}
          />
        </Field>
      )}

      <div className={cn('rounded-md bg-ball-soft p-4 transition-opacity', isFetching && 'opacity-70')}>
        <div className="font-display text-lg font-bold text-ink">{label}</div>
        {desc?.next?.length ? (
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
            {desc.next.slice(0, 3).map((n) => (
              <li key={n}>{fmtDateTime(n)}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-1 text-xs text-ink-3">Timezone {trigger.timezone}</div>
      </div>

      <button onClick={() => setAdvanced((a) => !a)} className="text-[13px] font-semibold text-ink-2 underline decoration-line-strong decoration-2 underline-offset-4 hover:text-ink">
        {advanced ? 'Use the simple picker' : 'Write a cron expression instead'}
      </button>
    </div>
  );
}

function WebhookPanel({ id, secret }: { id?: string; secret?: string }) {
  const rotate = useRotateSecret();
  if (!id || !secret)
    return <p className="rounded-md bg-surface-2 p-4 text-[15px] text-ink-2">Save this automation and I’ll make you a private URL. Call it from Shortcuts, IFTTT, Home Assistant or curl to start a fetch.</p>;
  const url = `${window.location.origin}/api/hooks/${id}/${secret}`;
  const curl = `curl -X POST ${url}`;
  const copy = (t: string, what: string) => navigator.clipboard.writeText(t).then(() => toast.success(`${what} copied`));
  return (
    <div className="space-y-4">
      <Field label="Your webhook URL" hint="Anyone with this URL can trigger the run. Keep it secret, rotate it if it leaks.">
        <div className="flex gap-2">
          <Input readOnly value={url} className="tabular font-mono text-[13px]" onFocus={(e) => e.target.select()} />
          <Button variant="soft" size="icon" onClick={() => copy(url, 'URL')} aria-label="Copy URL">
            <Copy />
          </Button>
        </div>
      </Field>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[13px] font-semibold">Try it</span>
          <button onClick={() => copy(curl, 'curl command')} className="text-xs font-semibold text-ink-2 hover:text-ink">
            Copy
          </button>
        </div>
        <pre className="overflow-x-auto rounded-md bg-[#2b1a33] p-4 font-mono text-[13px] leading-relaxed text-[#f6efe9]">
          <span className="text-[#d7f25a]">curl</span> -X POST {url}
        </pre>
      </div>
      <Button variant="outline" size="sm" loading={rotate.isPending} onClick={() => rotate.mutate(id, { onSuccess: () => toast.success('New URL generated', { description: 'The old one stopped working.' }) })}>
        <RefreshCw /> Rotate secret
      </Button>
    </div>
  );
}

function VenuePicker({ trigger, onChange }: { trigger: Extract<Trigger, { type: 'venue-online' }>; onChange: (t: Trigger) => void }) {
  const [q, setQ] = useState('');
  const { data } = useVenues();
  const list = (data?.venues ?? []).filter((v) => !q || v.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  const selected = data?.venues.find((v) => v.slug === trigger.venueSlug);
  return (
    <div className="space-y-3">
      <p className="text-[15px] text-ink-2">I’ll check every couple of minutes and fetch the first time it opens each day.</p>
      {selected && (
        <div className="flex items-center gap-3 rounded-lg border-2 border-ink bg-ball-soft p-2.5">
          <SmartImage src={selected.image} alt="" width={160} className="size-12 rounded-[12px]" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{selected.name}</div>
            <div className="text-[13px] text-ink-2">{selected.online ? 'Open right now' : 'Closed right now'}</div>
          </div>
          <Check className="mr-1 size-5" />
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search venues" className="pl-10" aria-label="Search venues" />
      </div>
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {list.map((v) => (
          <li key={v.id}>
            <button
              onClick={() => onChange({ type: 'venue-online', venueSlug: v.slug, venueName: v.name })}
              className={cn('flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-surface-2', v.slug === trigger.venueSlug && 'bg-surface-2')}
            >
              <SmartImage src={v.image} alt="" width={120} className="size-10 rounded-[10px]" />
              <span className="min-w-0 flex-1 truncate font-medium">{v.name}</span>
              <span className={cn('size-2 rounded-full', v.online ? 'bg-mint' : 'bg-ink-3')} aria-label={v.online ? 'open' : 'closed'} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
