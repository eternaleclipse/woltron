import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Clock, Leaf, Sparkles, Star, Users, Wallet, X } from 'lucide-react';
import type { FetchResponse, FetchSuggestion } from '@woltron/shared';
import { useFetchSearch, useSettings } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { cn, fmtShort } from '@/lib/utils';
import { useMascotName } from '@/lib/prefs';
import { Mascot } from '@/components/mascot';
import { TennisBall } from '@/components/brand';
import { EmptyState } from '@/components/bits';
import { ItemSheet } from '@/components/item-sheet';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/primitives';
import { SmartImage } from '@/components/ui/controls';

const EXAMPLES = [
  'something spicy & vegan under ₪60',
  'cozy ramen for two',
  'a sushi feast, no cucumber',
  'hangover breakfast, fast',
  'healthy lunch under ₪50',
  'sweet treat for the couch',
];

const SNIFFS = ['Sniffing around the neighbourhood…', 'Checking who’s open…', 'Comparing menus…', 'Picking the tastiest ones…'];

export function FetchPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const search = useFetchSearch();
  const name = useMascotName();
  const { data: settings } = useSettings();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [sel, setSel] = useState<{ s: FetchSuggestion; step: 'options' | 'preset' } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const go = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setQ(t);
    setParams({ q: t }, { replace: true });
    search.mutate(t);
  };

  useEffect(() => {
    const initial = params.get('q');
    if (initial) search.mutate(initial);
    else inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = search.data;
  const loading = search.isPending;
  const hasResult = !!data && !loading;

  return (
    <div className="space-y-8">
      <section className={cn('relative transition-[padding] duration-500', !hasResult && !loading ? 'lg:pt-10' : '')}>
        <div className="flex flex-col items-center text-center">
          <Mascot state={loading ? 'sniffing' : search.isError ? 'sad' : hasResult ? (data.suggestions.length ? 'happy' : 'sad') : 'idle'} size={hasResult ? 88 : 132} />
          <h1 className="mt-3 font-display text-[36px] font-extrabold leading-[1] tracking-[-0.035em] sm:text-[52px]">
            {loading ? 'On it.' : hasResult ? 'Here’s what I found.' : 'What are we craving?'}
          </h1>
          <p className="mt-2 max-w-md text-[15px] text-ink-2">
            {loading ? <SniffTicker /> : hasResult ? `Tap a dish to pick options, or save it to a preset for later.` : `Say it like you’d say it to a friend. ${name} reads menus near ${settings?.location?.label ?? "you"} and brings back the best matches.`}
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            go(q);
          }}
          className="mx-auto mt-6 max-w-2xl"
        >
          <div className="flex items-end gap-2 rounded-[28px] border-2 border-ink bg-surface p-2 pl-5 shadow-md transition-shadow focus-within:shadow-[0_0_0_6px_var(--ball-soft),var(--shadow-md)]">
            <label htmlFor="fetch-q" className="sr-only">
              What are you craving?
            </label>
            <textarea
              ref={inputRef}
              id="fetch-q"
              rows={1}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  go(q);
                }
              }}
              placeholder="something spicy & vegan under ₪60"
              className="max-h-40 min-h-12 flex-1 resize-none bg-transparent py-3 text-lg text-ink outline-none [field-sizing:content] placeholder:text-ink-3"
            />
            {q && !loading && (
              <button type="button" onClick={() => setQ('')} className="mb-3 grid size-8 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Clear">
                <X className="size-4" />
              </button>
            )}
            <Button type="submit" variant="ball" size="xl" className="rounded-[22px] px-5" disabled={loading || !q.trim()}>
              <TennisBall size={22} spin={loading} />
              <span className="hidden sm:inline">{loading ? 'Fetching…' : 'Fetch'}</span>
            </Button>
          </div>
        </form>

        <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:mx-auto sm:max-w-2xl sm:flex-wrap sm:justify-center sm:overflow-visible">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => go(ex)}
              disabled={loading}
              className="shrink-0 rounded-full border border-line-strong bg-surface px-3.5 py-2 text-[13px] font-medium text-ink-2 transition-[transform,border-color,color] duration-200 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:border-ink-3 hover:text-ink disabled:opacity-50"
            >
              “{ex}”
            </button>
          ))}
        </div>
      </section>

      {loading && <ResultsSkeleton />}

      {search.isError && !loading && (
        <EmptyState mascot="sad" title="Lost the scent" action={<Button onClick={() => go(q)}>Try again</Button>}>
          {errorMessage(search.error)}
        </EmptyState>
      )}

      {hasResult && (
        <Results
          data={data}
          onAdd={(s) => {
            setSel({ s, step: 'preset' });
            setSheetOpen(true);
          }}
          onOpen={(s) => {
            setSel({ s, step: 'options' });
            setSheetOpen(true);
          }}
        />
      )}

      <ItemSheet item={sel?.s.item ?? null} venue={sel?.s.venue ?? null} open={sheetOpen} onOpenChange={setSheetOpen} initialStep={sel?.step} />
    </div>
  );
}

function SniffTicker() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % SNIFFS.length), 1100);
    return () => clearInterval(t);
  }, []);
  return (
    <AnimatePresence mode="wait">
      <motion.span key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="inline-block" role="status">
        {SNIFFS[i]}
      </motion.span>
    </AnimatePresence>
  );
}

/** A ball rolling along a paw-print trail while the LLM thinks (real calls take 5–8s). */
function SniffTrail() {
  return (
    <div className="relative mx-auto mb-6 h-10 max-w-2xl" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-2">
        {Array.from({ length: 14 }).map((_, i) => (
          <motion.span
            key={i}
            className="text-[13px] text-ink-3"
            style={{ transform: `rotate(${i % 2 ? 20 : -20}deg) translateY(${i % 2 ? 5 : -5}px)` }}
            initial={{ opacity: 0.15 }}
            animate={{ opacity: [0.15, 0.7, 0.15] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.12 }}
          >
            🐾
          </motion.span>
        ))}
      </div>
      <motion.div
        className="absolute top-0"
        initial={{ left: '0%', rotate: 0 }}
        animate={{ left: '92%', rotate: 900 }}
        transition={{ duration: 9, ease: [0.2, 0.7, 0.3, 1] }}
      >
        <TennisBall size={40} />
      </motion.div>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div>
    <SniffTrail />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="overflow-hidden p-2" style={{ opacity: 1 - i * 0.12 }}>
          <Skeleton className="aspect-[4/3] rounded-[22px]" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-12 w-full" />
          </div>
        </Card>
      ))}
    </div>
    </div>
  );
}

function IntentChips({ data }: { data: FetchResponse }) {
  const i = data.intent;
  const chips: Array<{ label: string; icon?: React.ReactNode; tone: string }> = [
    ...i.cuisines.map((c) => ({ label: c, tone: 'bg-ball-soft text-ball-deep' })),
    ...i.dietary.map((d) => ({ label: d, icon: <Leaf />, tone: 'bg-mint-soft text-mint-ink' })),
    ...(i.maxPrice ? [{ label: `under ${fmtShort(i.maxPrice)}`, icon: <Wallet />, tone: 'bg-biscuit-soft text-biscuit-ink' }] : []),
    ...(i.partySize ? [{ label: `for ${i.partySize}`, icon: <Users />, tone: 'bg-plum-soft text-plum-ink' }] : []),
    ...(i.mood ? [{ label: i.mood, icon: <Sparkles />, tone: 'bg-tongue-soft text-tongue-ink' }] : []),
    ...i.excluded.map((x) => ({ label: `no ${x}`, icon: <X />, tone: 'bg-danger-soft text-danger-ink' })),
    ...i.searchTerms.filter((t) => !i.cuisines.includes(t)).slice(0, 3).map((t) => ({ label: t, tone: 'bg-surface-3 text-ink-2' })),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[13px] text-ink-3">I heard</span>
      {chips.map((c, idx) => (
        <motion.span
          key={c.label + idx}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: idx * 0.05, type: 'spring', stiffness: 500, damping: 24 }}
          className={cn('inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold [&_svg]:size-3.5', c.tone)}
        >
          {c.icon}
          {c.label}
        </motion.span>
      ))}
    </div>
  );
}

function Results({ data, onAdd, onOpen }: { data: FetchResponse; onAdd: (s: FetchSuggestion) => void; onOpen: (s: FetchSuggestion) => void }) {
  if (data.suggestions.length === 0) {
    return (
      <EmptyState mascot="sad" title="Came back empty-pawed">
        Nothing nearby matched “{data.query}”. Try loosening the budget or a different cuisine.
      </EmptyState>
    );
  }
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <IntentChips data={data} />
        <span className="text-xs text-ink-3">
          {data.suggestions.length} picks in {(data.tookMs / 1000).toFixed(1)}s{data.usedLLM && data.model ? ` with ${data.model.split('/').pop()}` : ', keyword match'}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.suggestions.map((s, i) => (
          <motion.div
            key={s.item.id}
            initial={{ opacity: 0, y: 24, rotate: i % 2 ? 1.5 : -1.5 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ delay: 0.08 * i, type: 'spring', stiffness: 260, damping: 22 }}
          >
            <SuggestionCard s={s} rank={i} onAdd={() => onAdd(s)} onOpen={() => onOpen(s)} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function SuggestionCard({ s, rank, onAdd, onOpen }: { s: FetchSuggestion; rank: number; onAdd: () => void; onOpen: () => void }) {
  return (
    <Card interactive className="flex h-full flex-col overflow-hidden p-2">
      <button onClick={onOpen} className="relative block text-left" aria-label={`Open ${s.item.name}`}>
        <SmartImage src={s.item.image} blurhash={s.item.blurhash} alt={s.item.name} width={640} className="aspect-[4/3] w-full rounded-[22px]" />
        {rank === 0 && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-ball px-3 py-1 text-xs font-bold text-ball-ink shadow-md">
            <TennisBall size={14} /> Top pick
          </span>
        )}
        <span className="tabular absolute bottom-3 right-3 rounded-full bg-surface/95 px-3 py-1 font-display text-[15px] font-bold shadow-md backdrop-blur">
          {fmtShort(s.item.price)}
        </span>
      </button>
      <div className="flex flex-1 flex-col px-2 pb-1.5 pt-3">
        <div className="flex items-center gap-2 text-[13px] text-ink-3">
          <span className="truncate font-semibold text-ink-2">{s.venue.name}</span>
          {s.venue.rating && (
            <span className="inline-flex shrink-0 items-center gap-0.5">
              <Star className="size-3 fill-biscuit text-biscuit" />
              {s.venue.rating.score.toFixed(1)}
            </span>
          )}
          {s.venue.deliveryEstimateRange && (
            <span className="inline-flex shrink-0 items-center gap-0.5">
              <Clock className="size-3" />
              {s.venue.deliveryEstimateRange}′
            </span>
          )}
        </div>
        <h3 dir="auto" className="mt-1 line-clamp-2 font-display text-lg font-bold leading-tight">{s.item.name}</h3>
        {/* The dog's reasoning, as a little speech bubble */}
        <p className="relative mt-3 rounded-[14px] rounded-tl-[4px] bg-surface-2 px-3 py-2 text-[13px] leading-snug text-ink-2">{s.reason}</p>
        <div className="mt-auto flex gap-2 pt-3">
          <Button variant="soft" className="flex-1" onClick={onAdd}>
            Add to preset
          </Button>
          <Button variant="ball" className="flex-1" onClick={onOpen}>
            Order now
          </Button>
        </div>
      </div>
    </Card>
  );
}
