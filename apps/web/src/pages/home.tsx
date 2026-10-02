import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { ArrowUpRight, CalendarClock, Play, Plus } from 'lucide-react';
import type { Automation, Pack, Preset } from '@woltron/shared';
import { useAutomations, usePacks, usePresets, useRuns, useSettings } from '@/lib/queries';
import { useMascotName } from '@/lib/prefs';
import { cn, fmtDateTime, fmtShort, greeting, groupByVenue, presetTotal } from '@/lib/utils';
import { Collage, Countdown, EmptyState, TriggerIcon } from '@/components/bits';
import { Mascot } from '@/components/mascot';
import { TennisBall } from '@/components/brand';
import { RunRow } from '@/components/run-row';
import { ConfirmCard } from '@/components/confirm-card';
import { useRunLauncher } from '@/components/run-launcher';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle, Skeleton } from '@/components/ui/primitives';

export function HomePage() {
  const { data: settings } = useSettings();
  const { data: presets, isLoading: lp } = usePresets();
  const { data: packs } = usePacks();
  const { data: runs, isLoading: lr } = useRuns();
  const { data: automations } = useAutomations();
  const name = useMascotName();
  const g = greeting();
  const firstName = settings?.wolt.user?.name?.split(' ')[0];

  const awaiting = runs?.filter((r) => r.status === 'awaiting-confirmation') ?? [];
  const recent = runs?.filter((r) => r.status !== 'awaiting-confirmation').slice(0, 5) ?? [];
  const next = automations
    ?.filter((a) => a.enabled && a.nextFireAt && new Date(a.nextFireAt).getTime() > Date.now())
    .sort((a, b) => new Date(a.nextFireAt!).getTime() - new Date(b.nextFireAt!).getTime())[0];

  const favPresets = presets?.filter((p) => p.favorite) ?? [];
  const favPacks = packs?.filter((p) => p.favorite) ?? [];
  const tiles: Array<{ kind: 'preset'; p: Preset } | { kind: 'pack'; p: Pack }> = [
    ...favPacks.map((p) => ({ kind: 'pack' as const, p })),
    ...(favPresets.length ? favPresets : (presets ?? []).slice(0, 4)).map((p) => ({ kind: 'preset' as const, p })),
  ].slice(0, 8);

  return (
    <div className="space-y-10 lg:space-y-12">
      {/* Greeting */}
      <section className="grid items-center gap-6 lg:grid-cols-[1fr_360px] lg:gap-10">
        <div className="flex items-center gap-4 sm:gap-6">
          <Mascot state={awaiting.length ? 'idle' : 'happy'} size={112} className="hidden sm:block" />
          <Mascot state={awaiting.length ? 'idle' : 'happy'} size={84} className="sm:hidden" />
          <div className="min-w-0">
            <h1 className="font-display text-[38px] font-extrabold leading-[0.98] tracking-[-0.035em] text-ink sm:text-[56px]">
              {g.hello}
              {firstName ? `, ${firstName}` : ''}
              {g.end}
            </h1>
            <p className="mt-2 text-[15px] text-ink-2 sm:text-lg">{g.line}</p>
          </div>
        </div>
        <NextUp automation={next} />
      </section>

      <FetchPrompt name={name} />

      {awaiting.length > 0 && (
        <section className="space-y-3">
          {awaiting.map((r) => (
            <ConfirmCard key={r.id} run={r} />
          ))}
        </section>
      )}

      {/* Quick run */}
      <section>
        <SectionTitle
          action={
            <Link to="/presets" className="text-sm font-semibold text-ink-2 hover:text-ink">
              All presets
            </Link>
          }
        >
          One tap, one fetch
        </SectionTitle>
        {lp ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/5] rounded-xl" />
            ))}
          </div>
        ) : tiles.length === 0 ? (
          <Card className="p-2">
            <EmptyState
              compact
              mascot="sleeping"
              title="Nothing saved yet"
              action={
                <Button variant="ball" asChild>
                  <Link to="/explore">
                    <Plus /> Build your first preset
                  </Link>
                </Button>
              }
            >
              Save a basket you love and I’ll fetch it in one tap.
            </EmptyState>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
            {tiles.map((t, i) => (
              <motion.div key={t.p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 26 }}>
                {t.kind === 'preset' ? <PresetTile preset={t.p} /> : <PackTile pack={t.p} presets={presets ?? []} />}
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Recent */}
      <section>
        <SectionTitle
          action={
            <Link to="/runs" className="text-sm font-semibold text-ink-2 hover:text-ink">
              All runs
            </Link>
          }
        >
          Recent fetches
        </SectionTitle>
        <Card className="p-1.5 sm:p-2">
          {lr ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <EmptyState compact mascot="sleeping" title="No runs yet">
              Tap a tile above and watch me go.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((r) => (
                <RunRow key={r.id} run={r} />
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

/** Dog-tag shaped "next up" card. */
function NextUp({ automation }: { automation?: Automation }) {
  const { data: presets } = usePresets();
  const { data: packs } = usePacks();
  if (!automation) {
    return (
      <Link
        to="/automations/new"
        className="group relative flex items-center gap-4 rounded-[28px] border-2 border-dashed border-line-strong p-5 text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
      >
        <CalendarClock className="size-6" />
        <div>
          <div className="font-semibold text-ink">Nothing scheduled</div>
          <div className="text-[13px]">Set up lunch on autopilot</div>
        </div>
      </Link>
    );
  }
  const target =
    automation.target.kind === 'preset' ? presets?.find((p) => p.id === automation.target.id) : packs?.find((p) => p.id === automation.target.id);
  return (
    <Link
      to={`/automations/${automation.id}`}
      className="group relative block overflow-hidden rounded-[28px] bg-collar p-5 pl-14 text-collar-ink shadow-lg transition-transform duration-300 ease-[var(--ease-spring)] hover:-rotate-1 hover:scale-[1.01]"
    >
      {/* tag ring hole */}
      <span className="absolute left-5 top-1/2 size-5 -translate-y-1/2 rounded-full bg-bg ring-4 ring-[color-mix(in_srgb,var(--collar-ink)_25%,transparent)]" aria-hidden />
      <div className="flex items-center justify-between gap-3 text-[13px] font-semibold opacity-70">
        <span>Next up</span>
        <ArrowUpRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="mt-1 font-display text-[40px] font-extrabold leading-none tracking-tight text-ball dark:text-[#5f7300]">
        <Countdown to={automation.nextFireAt!} />
      </div>
      <div className="mt-2 truncate text-[15px] font-semibold">
        {target ? `${target.emoji} ${target.name}` : automation.name}
      </div>
      <div className="truncate text-[13px] opacity-70">
        {automation.trigger.type === 'schedule' ? automation.trigger.humanLabel ?? automation.name : fmtDateTime(automation.nextFireAt)}
        {automation.confirm === 'ask' ? ', asks first' : ''}
      </div>
    </Link>
  );
}

function FetchPrompt({ name }: { name: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        navigate(q.trim() ? `/fetch?q=${encodeURIComponent(q.trim())}` : '/fetch');
      }}
      className="group relative flex items-center gap-2 rounded-full border border-line-strong bg-surface p-2 pl-5 shadow-sm transition-[box-shadow,border-color] focus-within:border-ink focus-within:shadow-[0_0_0_5px_var(--ball-soft)]"
    >
      <label htmlFor="home-fetch" className="sr-only">
        Ask {name} to fetch something
      </label>
      <input
        id="home-fetch"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Tell ${name} what you’re craving…`}
        className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3 sm:text-lg"
      />
      <Button type="submit" variant="ball" size="lg" className="rounded-full px-5">
        <TennisBall size={20} /> <span className="hidden sm:inline">Go fetch</span>
      </Button>
    </form>
  );
}

function PresetTile({ preset }: { preset: Preset }) {
  const { launch } = useRunLauncher();
  const venues = groupByVenue(preset.items).length;
  return (
    <Card interactive className="group relative overflow-hidden p-2">
      <Link to={`/presets/${preset.id}`} className="block" aria-label={`Edit ${preset.name}`}>
        <Collage preset={preset} className="aspect-[5/4] w-full" rounded="rounded-[22px]" />
        <div className="px-2 pb-2 pt-3">
          <div className="truncate font-display text-[17px] font-bold leading-tight">{preset.name}</div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 text-[13px] text-ink-3">
            <span className="tabular font-semibold text-ink-2">{fmtShort(presetTotal(preset))}</span>
            <span className="min-w-0 truncate">{venues > 1 ? `${venues} venues` : preset.items[0]?.venueName}</span>
          </div>
        </div>
      </Link>
      <RunFab onClick={() => launch({ kind: 'preset', id: preset.id })} label={`Run ${preset.name}`} />
    </Card>
  );
}

function PackTile({ pack, presets }: { pack: Pack; presets: Preset[] }) {
  const { launch } = useRunLauncher();
  const members = pack.members.map((m) => presets.find((p) => p.id === m.presetId)).filter((p): p is Preset => !!p);
  return (
    <Card interactive className="group relative overflow-hidden p-2">
      <Link to={`/packs/${pack.id}`} className="block" aria-label={`Edit ${pack.name}`}>
        <div className="relative grid aspect-[5/4] w-full place-items-center overflow-hidden rounded-[22px] bg-surface-3">
          <div className="relative h-[70%] w-[62%]">
            {members.slice(0, 3).map((p, i) => (
              <Collage
                key={p.id}
                preset={p}
                showEmoji={false}
                rounded="rounded-[16px]"
                className="absolute inset-0 shadow-md ring-[3px] ring-surface transition-transform duration-500 ease-[var(--ease-spring)] group-hover:[transform:var(--fan)]"
                style={{ transform: `rotate(${(i - 1) * 7}deg) translateX(${(i - 1) * 10}px)`, ['--fan' as string]: `rotate(${(i - 1) * 14}deg) translateX(${(i - 1) * 26}px)`, zIndex: 3 - Math.abs(i - 1) }}
              />
            ))}
          </div>
          <span className="absolute bottom-2.5 left-2.5 grid size-10 place-items-center rounded-[14px] bg-surface text-xl shadow-md">{pack.emoji}</span>
        </div>
        <div className="px-2 pb-2 pt-3">
          <div className="truncate font-display text-[17px] font-bold leading-tight">{pack.name}</div>
          <div className="mt-0.5 text-[13px] text-ink-3">
            Pack of <span className="font-semibold text-ink-2">{members.length}</span>
          </div>
        </div>
      </Link>
      <RunFab onClick={() => launch({ kind: 'pack', id: pack.id })} label={`Spin ${pack.name}`} />
    </Card>
  );
}

export function RunFab({ onClick, label, className }: { onClick: () => void; label: string; className?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        'absolute right-4 top-4 z-20 grid size-11 place-items-center rounded-full bg-ball text-ball-ink shadow-ball transition-[transform,box-shadow] duration-200 ease-[var(--ease-spring)] hover:scale-110 active:translate-y-[3px] active:scale-95 active:shadow-none',
      )}
    >
      <Play className={cn('size-[18px] translate-x-px fill-current', className)} />
    </button>
  );
}

export { TriggerIcon };
