import { Link } from 'react-router';
import { motion } from 'motion/react';
import { Plus } from 'lucide-react';
import type { Pack, Preset } from '@woltron/shared';
import { usePacks, usePresets } from '@/lib/queries';
import { relTime } from '@/lib/utils';
import { EmptyState, ErrorState, PageHeader } from '@/components/bits';
import { PackStack, STRATEGIES } from '@/components/pack-bits';
import { useRunLauncher } from '@/components/run-launcher';
import { Button } from '@/components/ui/button';
import { Badge, Card, Skeleton } from '@/components/ui/primitives';
import { RunFab } from './home';

export function PacksPage() {
  const { data: packs, isLoading, isError, error, refetch } = usePacks();
  const { data: presets } = usePresets();
  return (
    <div>
      <PageHeader
        title="Packs"
        subtitle="Can’t decide? Bundle a few presets into a pack and I’ll pick one each time: at random, by weight, or taking turns."
        actions={
          <Button variant="ball" size="lg" asChild>
            <Link to="/packs/new">
              <Plus /> New pack
            </Link>
          </Button>
        }
      />
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} retry={() => refetch()} />
      ) : !packs?.length ? (
        <EmptyState
          mascot="idle"
          title="No packs yet"
          action={
            <Button variant="ball" asChild>
              <Link to="/packs/new">Make a pack</Link>
            </Button>
          }
        >
          A pack is a little roulette of presets, like “Random Asian” for weekday lunches.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {packs.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <PackCard pack={p} presets={presets ?? []} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function PackCard({ pack, presets }: { pack: Pack; presets: Preset[] }) {
  const { launch } = useRunLauncher();
  const members = pack.members.map((m) => presets.find((p) => p.id === m.presetId)).filter((p): p is Preset => !!p);
  return (
    <Card interactive className="group relative p-2">
      <Link to={`/packs/${pack.id}`} className="block" aria-label={`Edit ${pack.name}`}>
        <PackStack presets={members} className="aspect-[16/10] rounded-[22px]" />
        <div className="px-2.5 pb-2 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>
              {pack.emoji}
            </span>
            <h3 className="min-w-0 flex-1 truncate font-display text-xl font-bold">{pack.name}</h3>
            <Badge tone="plum">{STRATEGIES[pack.strategy].label}</Badge>
          </div>
          {pack.description && <p className="mt-1 line-clamp-1 text-[13px] text-ink-2">{pack.description}</p>}
          <div className="mt-3 flex flex-wrap gap-1">
            {members.map((m) => (
              <span key={m.id} title={m.name} className="grid size-8 place-items-center rounded-full bg-surface-2 text-base">
                {m.emoji}
              </span>
            ))}
          </div>
          <div className="mt-3 text-xs text-ink-3">
            {pack.runCount > 0 ? `Spun ${pack.runCount}×, last ${relTime(pack.lastRunAt)}` : 'Never spun'}
            {pack.history[0] && (
              <>
                {', '}last pick {presets.find((p) => p.id === pack.history[0]!.presetId)?.emoji}
              </>
            )}
          </div>
        </div>
      </Link>
      <RunFab onClick={() => launch({ kind: 'pack', id: pack.id })} label={`Spin and run ${pack.name}`} />
    </Card>
  );
}
