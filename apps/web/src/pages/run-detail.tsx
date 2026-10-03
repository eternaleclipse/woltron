import { Link, useParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Clock, ExternalLink, RotateCcw } from 'lucide-react';
import type { Run, RunStatus } from '@woltron/shared';
import { useRun } from '@/lib/queries';
import { cn, fmt, fmtShort, fmtTime, relTime } from '@/lib/utils';
import { ErrorState, ModePill, RUN_STATUS, RunStatusBadge, SOURCE_LABEL, VENUE_STATUS } from '@/components/bits';
import { Mascot } from '@/components/mascot';
import { ConfirmCard } from '@/components/confirm-card';
import { useRunLauncher } from '@/components/run-launcher';
import { Badge, Card, Skeleton } from '@/components/ui/primitives';
import { SmartImage } from '@/components/ui/controls';
import { Button } from '@/components/ui/button';

const HEADLINE: Record<RunStatus, string> = {
  pending: 'Fetching…',
  placing: 'Fetching…',
  'awaiting-confirmation': 'Waiting for your OK',
  placed: 'Good boy! Order placed',
  delivered: 'Delivered. Enjoy!',
  simulated: 'Dry run done',
  'handed-off': 'Your basket is ready in Wolt',
  skipped: 'Sat and stayed',
  failed: 'Ruh-roh, that didn’t work',
  cancelled: 'Cancelled',
  expired: 'No answer, so I skipped it',
};

const STEPS = ['Sniff', 'Check', 'Place', 'Done'] as const;
function stepIndex(r: Run): number {
  const vs = r.venueOrders.map((v) => v.status);
  if (['placed', 'delivered', 'simulated', 'handed-off'].includes(r.status)) return 4;
  if (r.status === 'placing') return 2;
  if (r.status === 'awaiting-confirmation' || vs.every((s) => s === 'ready')) return 2;
  if (vs.some((s) => s === 'validating')) return 1;
  return 0;
}

export function RunDetailPage() {
  const { id } = useParams();
  const { data: run, isLoading, isError, error, refetch } = useRun(id);
  const { launch } = useRunLauncher();

  if (isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  if (isError || !run) return <ErrorState error={error} retry={() => refetch()} />;

  const meta = RUN_STATUS[run.status];
  const step = stepIndex(run);
  const failed = ['failed', 'skipped', 'cancelled', 'expired'].includes(run.status);

  return (
    <div>
      <Link to="/runs" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" /> Runs
      </Link>

      {/* Hero */}
      <section className="relative mb-6 overflow-hidden rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3 sm:flex-nowrap sm:items-center">
          <AnimatePresence mode="wait">
            <motion.div className="origin-top-left max-sm:-mb-6 max-sm:scale-[0.62]" key={meta.mascot} initial={{ scale: 0.7, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.8, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
              <Mascot state={meta.mascot} size={104} />
            </motion.div>
          </AnimatePresence>
          <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2 max-sm:absolute max-sm:right-5 max-sm:top-5 max-sm:flex-col max-sm:items-end">
              <RunStatusBadge status={run.status} size="lg" />
              <ModePill mode={run.mode} to={null} short />
            </div>
            <AnimatePresence mode="wait">
              <motion.h1
                key={run.status}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                className="font-display text-[30px] font-extrabold leading-[1.05] tracking-tight sm:text-[40px]"
              >
                {HEADLINE[run.status]}
              </motion.h1>
            </AnimatePresence>
            <p className="mt-1.5 text-[15px] text-ink-2">
              <strong className="text-ink">{run.presetName}</strong>
              {run.packName && <> from the {run.packName} pack</>}, started by {SOURCE_LABEL[run.source].toLowerCase()} {relTime(run.createdAt)}
            </p>
          </div>
          <div className="flex items-baseline gap-2 sm:block sm:text-right">
            <div className="text-[13px] text-ink-3">Total</div>
            <div className="tabular font-display text-3xl font-extrabold sm:text-4xl">{fmtShort(run.total)}</div>
          </div>
        </div>

        {!failed && (
          <ol className="mt-6 grid grid-cols-4 gap-2" aria-label="Progress">
            {STEPS.map((s, i) => {
              const done = i < step;
              const current = i === step && step < 4;
              return (
                <li key={s} className="min-w-0">
                  <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                    <motion.div
                      className={cn('h-full rounded-full', done ? 'bg-ball' : current ? 'bg-ball/60' : '')}
                      initial={false}
                      animate={{ width: done ? '100%' : current ? ['10%', '70%', '10%'] : '0%' }}
                      transition={current ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { type: 'spring', stiffness: 120, damping: 20 }}
                    />
                  </div>
                  <div className={cn('mt-1.5 text-xs font-semibold', done || current ? 'text-ink' : 'text-ink-3')}>{s}</div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {run.status === 'awaiting-confirmation' && <ConfirmCard run={run} className="mb-6" />}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {run.venueOrders.map((v, i) => {
            const vs = VENUE_STATUS[v.status];
            return (
              <Card key={v.venueId} className="overflow-hidden">
                <div className="flex items-center gap-3 border-b border-line p-4">
                  <SmartImage src={v.venueImage} alt="" width={160} className="size-12 shrink-0 rounded-[14px]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {run.venueOrders.length > 1 && <span className="text-xs font-semibold text-ink-3">Order {i + 1}</span>}
                    </div>
                    <Link to={`/explore/${v.venueSlug}`} className="block truncate font-display text-lg font-bold hover:underline">
                      {v.venueName}
                    </Link>
                  </div>
                  <Badge tone={vs.tone}>{vs.label}</Badge>
                </div>
                <ul className="divide-y divide-line">
                  {v.lines.map((l, li) => (
                    <li key={li} className={cn('flex items-center gap-3 px-4 py-3', !l.available && 'opacity-50')}>
                      <SmartImage src={l.image} alt="" width={120} className="size-11 shrink-0 rounded-[12px]" />
                      <div className="min-w-0 flex-1">
                        <div dir="auto" className="truncate font-medium">
                          <span className="tabular font-semibold text-ink-2">{l.quantity}×</span> {l.name}
                        </div>
                        {l.optionSummary && <div className="truncate text-[13px] text-ink-3">{l.optionSummary}</div>}
                        {!l.available && <div className="text-[13px] font-semibold text-danger-ink">Unavailable</div>}
                      </div>
                      <span className="tabular text-sm">{fmtShort({ amount: l.unitPrice.amount * l.quantity, currency: l.unitPrice.currency })}</span>
                    </li>
                  ))}
                </ul>
                <dl className="space-y-1 bg-surface-2 px-4 py-3 text-sm">
                  <Row k="Subtotal" v={fmt(v.subtotal)} />
                  {v.deliveryFee && <Row k="Delivery" v={fmt(v.deliveryFee)} />}
                  {v.serviceFee && <Row k="Service" v={fmt(v.serviceFee)} />}
                  <Row k="Total" v={fmt(v.total)} strong />
                </dl>
                {(v.error || v.etaMinutes || v.checkoutUrl) && (
                  <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
                    {v.error && <p className="flex-1 text-sm font-medium text-danger-ink">{v.error}</p>}
                    {v.etaMinutes && !v.error && ['placed', 'in-delivery', 'simulated', 'ready', 'placing'].includes(v.status) && (
                      <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
                        <Clock className="size-4" /> About {v.etaMinutes} min
                      </span>
                    )}
                    {v.checkoutUrl && (
                      <Button variant="ball" size="md" asChild className="ml-auto">
                        <a href={v.checkoutUrl} target="_blank" rel="noreferrer">
                          {v.status === 'handed-off' ? 'Finish in Wolt' : v.status === 'simulated' ? 'Open in Wolt' : 'Track in Wolt'} <ExternalLink />
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-8">
          <Card className="p-5">
            <h2 className="mb-4 font-display text-lg font-bold">What happened</h2>
            <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-0.5 before:bg-line">
              <AnimatePresence initial={false}>
                {run.log.map((l, i) => (
                  <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="relative pl-6">
                    <span
                      className={cn(
                        'absolute left-0 top-1.5 size-3 rounded-full ring-4 ring-surface',
                        l.level === 'success' ? 'bg-mint' : l.level === 'warn' ? 'bg-biscuit' : l.level === 'error' ? 'bg-danger' : 'bg-ink-3',
                      )}
                    />
                    <p className="text-sm leading-snug text-ink">{l.message}</p>
                    <time className="tabular text-xs text-ink-3">{fmtTime(l.at)}</time>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          </Card>
          {!meta.active && (
            <Button variant="soft" size="lg" className="w-full" onClick={() => launch(run.target)}>
              <RotateCcw /> Fetch again
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3', strong ? 'pt-1 font-semibold text-ink' : 'text-ink-2')}>
      <dt>{k}</dt>
      <dd className="tabular">{v}</dd>
    </div>
  );
}
