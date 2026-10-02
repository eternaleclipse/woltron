import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Copy, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import type { Preset } from '@woltron/shared';
import { useDeletePreset, useDuplicatePreset, usePresets, useSavePreset, toPresetInput } from '@/lib/queries';
import { cn, fmtShort, groupByVenue, presetTotal, relTime } from '@/lib/utils';
import { Collage, EmptyState, ErrorState, PageHeader } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { Card, Chip, Skeleton } from '@/components/ui/primitives';
import { Menu } from '@/components/ui/controls';
import { RunFab } from './home';
import { useRunLauncher } from '@/components/run-launcher';

type Filter = 'all' | 'fav' | 'multi';

export function PresetsPage() {
  const { data, isLoading, isError, error, refetch } = usePresets();
  const [filter, setFilter] = useState<Filter>('all');
  const list = (data ?? []).filter((p) => (filter === 'fav' ? p.favorite : filter === 'multi' ? groupByVenue(p.items).length > 1 : true));

  return (
    <div>
      <PageHeader
        title="Presets"
        subtitle="Baskets you love, saved. A preset can pull from several restaurants at once."
        actions={
          <Button variant="ball" size="lg" asChild>
            <Link to="/presets/new">
              <Plus /> New preset
            </Link>
          </Button>
        }
      />
      <div className="mb-5 flex gap-2">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          All {data && <span className="opacity-60">{data.length}</span>}
        </Chip>
        <Chip active={filter === 'fav'} onClick={() => setFilter('fav')}>
          <Star /> Favourites
        </Chip>
        <Chip active={filter === 'multi'} onClick={() => setFilter('multi')}>
          Multi-venue
        </Chip>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} retry={() => refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          mascot="sleeping"
          title={filter === 'all' ? 'No presets yet' : 'Nothing here'}
          action={
            <Button variant="ball" asChild>
              <Link to="/explore">Find something tasty</Link>
            </Button>
          }
        >
          {filter === 'all' ? 'Browse restaurants, add items, and save them as a preset I can fetch any time.' : 'No presets match this filter.'}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p, i) => (
            <motion.div key={p.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <PresetCard preset={p} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function PresetCard({ preset }: { preset: Preset }) {
  const navigate = useNavigate();
  const { launch } = useRunLauncher();
  const save = useSavePreset();
  const dup = useDuplicatePreset();
  const del = useDeletePreset();
  const venues = groupByVenue(preset.items);
  const toggleFav = () => save.mutate({ id: preset.id, input: { ...toPresetInput(preset), favorite: !preset.favorite } });

  return (
    <Card interactive className="group relative flex h-full flex-col p-2">
      <Link to={`/presets/${preset.id}`} className="block rounded-[22px]" aria-label={`Edit ${preset.name}`}>
        <Collage preset={preset} className="aspect-[16/10] w-full" rounded="rounded-[22px]" />
      </Link>
      <RunFab onClick={() => launch({ kind: 'preset', id: preset.id })} label={`Run ${preset.name}`} />
      <div className="flex flex-1 flex-col px-2.5 pb-2 pt-3">
        <div className="flex items-start gap-2">
          <Link to={`/presets/${preset.id}`} className="min-w-0 flex-1">
            <h3 className="truncate font-display text-xl font-bold leading-tight">{preset.name}</h3>
          </Link>
          <button
            onClick={toggleFav}
            className={cn('grid size-8 place-items-center rounded-full transition-transform duration-300 ease-[var(--ease-spring)] hover:scale-110 active:scale-90', preset.favorite ? 'text-biscuit' : 'text-ink-3')}
            aria-pressed={preset.favorite}
            aria-label={preset.favorite ? 'Remove from favourites' : 'Add to favourites'}
          >
            <Star className={cn('size-5', preset.favorite && 'fill-current')} />
          </button>
          <Menu
            trigger={
              <button className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="More actions">
                <MoreHorizontal className="size-5" />
              </button>
            }
            items={[
              { label: 'Edit', icon: <Pencil />, onSelect: () => navigate(`/presets/${preset.id}`) },
              { label: 'Duplicate', icon: <Copy />, onSelect: () => dup.mutate(preset.id, { onSuccess: (p) => toast.success(`Duplicated as ${p.name}`) }) },
              'sep',
              {
                label: 'Delete',
                icon: <Trash2 />,
                danger: true,
                onSelect: () =>
                  del.mutate(preset.id, {
                    onSuccess: () => toast(`Deleted ${preset.name}`),
                  }),
              },
            ]}
          />
        </div>
        {preset.description && <p className="mt-1 line-clamp-1 text-[13px] text-ink-2">{preset.description}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {venues.map((v) => (
            <span key={v.venueId} className="max-w-full truncate rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-2">
              {v.venueName}
            </span>
          ))}
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <div className="tabular font-display text-2xl font-bold leading-none">{fmtShort(presetTotal(preset))}</div>
            <div className="mt-1 text-xs text-ink-3">
              {preset.items.reduce((s, i) => s + i.quantity, 0)} items{venues.length > 1 ? `, ${venues.length} separate orders` : ''}
            </div>
          </div>
          <div className="text-right text-xs text-ink-3">
            {preset.runCount > 0 ? (
              <>
                Fetched <span className="font-semibold text-ink-2">{preset.runCount}×</span>
                <br />
                last {relTime(preset.lastRunAt)}
              </>
            ) : (
              'Never fetched'
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
