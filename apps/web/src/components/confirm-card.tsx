import { Link } from 'react-router';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import type { Run } from '@woltron/shared';
import { useCancelRun, useConfirmRun } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { cn, fmtCountdown, fmtShort } from '@/lib/utils';
import { useNow } from './bits';
import { Button } from './ui/button';
import { Mascot } from './mascot';

/** "Needs your OK" — the most urgent thing on screen. Countdown ring drains as the window closes. */
export function ConfirmCard({ run, className, compact }: { run: Run; className?: string; compact?: boolean }) {
  const confirm = useConfirmRun();
  const cancel = useCancelRun();
  const now = useNow(1000);
  const end = run.confirmBy ? new Date(run.confirmBy).getTime() : now;
  const total = run.confirmBy ? Math.max(1, end - new Date(run.updatedAt).getTime()) : 1;
  const left = Math.max(0, end - now);
  const frac = Math.min(1, left / Math.max(total, 10 * 60_000));
  const R = 26;
  const C = 2 * Math.PI * R;

  const onConfirm = () =>
    confirm.mutate(run.id, {
      onSuccess: () => toast.success(run.mode === 'live' ? 'Good boy! Placing the order' : 'Off I go!', { description: run.presetName }),
      onError: (e) => toast.error('Couldn’t confirm', { description: errorMessage(e) }),
    });
  const onCancel = () =>
    cancel.mutate(run.id, {
      onSuccess: () => toast('Cancelled', { description: `${run.presetName} stays in the kennel.` }),
      onError: (e) => toast.error('Couldn’t cancel', { description: errorMessage(e) }),
    });

  return (
    <motion.section
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      aria-label="Run waiting for confirmation"
      className={cn('relative overflow-hidden rounded-xl border-2 border-biscuit bg-biscuit-soft p-4 sm:p-5', className)}
    >
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative grid size-16 shrink-0 place-items-center">
          <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--line-strong)" strokeWidth="5" />
            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--biscuit)" strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} className="transition-[stroke-dashoffset] duration-1000 ease-linear" />
          </svg>
          <Mascot state="idle" size={40} still />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-biscuit-ink">
            Needs your OK. Closes in <span className="tabular">{fmtCountdown(left)}</span>
          </div>
          <Link to={`/runs/${run.id}`} className="block truncate font-display text-xl font-bold text-ink hover:underline">
            {run.presetName}
            {run.packName && <span className="font-sans text-[15px] font-medium text-ink-2"> from {run.packName}</span>}
          </Link>
          <div className="text-[13px] text-ink-2">
            <span className="tabular font-semibold text-ink">{fmtShort(run.total)}</span> from {run.venueOrders.map((v) => v.venueName).join(' + ')}
            {run.mode === 'live' && <span className="ml-2 font-semibold text-tongue-ink">Live order</span>}
          </div>
        </div>
        <div className={cn('flex gap-2', compact ? 'w-full' : 'w-full sm:w-auto')}>
          <Button variant="ghost" onClick={onCancel} loading={cancel.isPending} className="flex-1 sm:flex-none">
            Skip it
          </Button>
          <Button variant="ball" onClick={onConfirm} loading={confirm.isPending} className="flex-1 sm:flex-none">
            {run.mode === 'live' ? `Order ${fmtShort(run.total)}` : 'Go fetch'}
          </Button>
        </div>
      </div>
    </motion.section>
  );
}
