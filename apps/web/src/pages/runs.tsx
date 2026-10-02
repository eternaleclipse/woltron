import { useState } from 'react';
import type { Run } from '@woltron/shared';
import { useRuns } from '@/lib/queries';
import { EmptyState, ErrorState, PageHeader } from '@/components/bits';
import { RunRow } from '@/components/run-row';
import { ConfirmCard } from '@/components/confirm-card';
import { Card, Chip, Skeleton } from '@/components/ui/primitives';

type F = 'all' | 'active' | 'done' | 'problems';
const ACTIVE: Run['status'][] = ['pending', 'placing', 'awaiting-confirmation'];
const DONE: Run['status'][] = ['placed', 'delivered', 'simulated', 'handed-off'];
const PROBLEMS: Run['status'][] = ['failed', 'skipped', 'expired', 'cancelled'];

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' });
}

export function RunsPage() {
  const { data, isLoading, isError, error, refetch } = useRuns(100);
  const [f, setF] = useState<F>('all');
  const awaiting = data?.filter((r) => r.status === 'awaiting-confirmation') ?? [];
  const list = (data ?? []).filter(
    (r) => r.status !== 'awaiting-confirmation' && (f === 'all' || (f === 'active' ? ACTIVE : f === 'done' ? DONE : PROBLEMS).includes(r.status)),
  );
  const groups = list.reduce<Array<{ day: string; runs: Run[] }>>((acc, r) => {
    const day = dayLabel(r.createdAt);
    const g = acc.find((x) => x.day === day);
    if (g) g.runs.push(r);
    else acc.push({ day, runs: [r] });
    return acc;
  }, []);

  return (
    <div>
      <PageHeader title="Runs" subtitle="Every fetch, live as it happens. Dry runs included." />
      {awaiting.length > 0 && (
        <div className="mb-6 space-y-3">
          {awaiting.map((r) => (
            <ConfirmCard key={r.id} run={r} />
          ))}
        </div>
      )}
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4">
        {(
          [
            ['all', 'All'],
            ['active', 'In progress'],
            ['done', 'Done'],
            ['problems', 'Skipped & failed'],
          ] as Array<[F, string]>
        ).map(([k, l]) => (
          <Chip key={k} active={f === k} onClick={() => setF(k)}>
            {l}
          </Chip>
        ))}
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} retry={() => refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState mascot="sleeping" title={f === 'all' ? 'No runs yet' : 'Nothing here'}>
          {f === 'all' ? 'Run a preset and it’ll show up here, live.' : 'No runs match this filter.'}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.day}>
              <h2 className="mb-2 px-1 text-[13px] font-semibold text-ink-3">{g.day}</h2>
              <Card className="p-1.5 sm:p-2">
                <ul className="divide-y divide-line">
                  {g.runs.map((r) => (
                    <RunRow key={r.id} run={r} />
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
