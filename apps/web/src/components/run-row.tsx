import { Link } from 'react-router';
import { motion } from 'motion/react';
import type { Run } from '@woltron/shared';
import { cn, fmtShort, relTime } from '@/lib/utils';
import { RUN_STATUS, RunStatusBadge, SOURCE_LABEL, MODE_META } from './bits';
import { SmartImage } from './ui/controls';

export function RunRow({ run, className }: { run: Run; className?: string }) {
  const s = RUN_STATUS[run.status];
  const img = run.venueOrders[0]?.lines.find((l) => l.image)?.image ?? run.venueOrders[0]?.venueImage;
  return (
    <motion.li layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn('list-none', className)}>
      <Link
        to={`/runs/${run.id}`}
        className="group flex items-center gap-3.5 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-2 sm:gap-4 sm:px-3"
      >
        <div className="relative">
          <SmartImage src={img} alt="" width={160} className="size-14 rounded-[16px]" />
          {s.active && <span className="pulse-dot absolute -right-0.5 -top-0.5 size-3 rounded-full bg-ball ring-2 ring-surface" style={{ color: 'var(--ball)' }} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-ink">{run.presetName}</span>
            {run.packName && <span className="hidden truncate text-[13px] text-ink-3 sm:inline">from {run.packName}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-ink-3">
            <span>{relTime(run.createdAt)}</span>
            <span>{SOURCE_LABEL[run.source]}</span>
            <span className={cn(run.mode === 'live' && 'font-semibold text-tongue-ink')}>{MODE_META[run.mode].short}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="tabular font-semibold text-ink">{fmtShort(run.total)}</span>
          <RunStatusBadge status={run.status} size="sm" />
        </div>
      </Link>
    </motion.li>
  );
}
