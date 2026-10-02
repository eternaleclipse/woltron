import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { Bike, Clock, MapPin, Search, Star, X } from 'lucide-react';
import type { Venue } from '@woltron/shared';
import { useSettings, useVenues } from '@/lib/queries';
import { cn, fmtShort } from '@/lib/utils';
import { EmptyState, ErrorState, PageHeader } from '@/components/bits';
import { Chip, Input, Skeleton } from '@/components/ui/primitives';
import { SmartImage } from '@/components/ui/controls';

export function ExplorePage() {
  const { data: settings } = useSettings();
  const [tag, setTag] = useState<string | undefined>();
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q.trim().toLowerCase());
  const loc = settings?.location;
  const { data, isLoading, isError, error, refetch, isFetching } = useVenues(tag, loc ? { lat: loc.lat, lon: loc.lon } : undefined);

  const venues = useMemo(() => {
    const list = data?.venues ?? [];
    const filtered = dq ? list.filter((v) => v.name.toLowerCase().includes(dq) || v.tags.some((t) => t.includes(dq)) || v.shortDescription?.toLowerCase().includes(dq)) : list;
    return [...filtered].sort((a, b) => Number(b.online) - Number(a.online));
  }, [data, dq]);

  return (
    <div>
      <PageHeader
        title="Explore"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4" />
            Delivering to{' '}
            <Link to="/settings#location" className="font-semibold text-ink underline decoration-ball-deep/50 decoration-2 underline-offset-4 hover:decoration-ball-deep">
              {loc?.label ?? loc?.address ?? 'set your address'}
            </Link>
          </span>
        }
      />

      <div className="sticky-under-titlebar sticky top-14 z-20 -mx-4 space-y-3 bg-bg/90 px-4 pb-3 pt-1 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10 lg:pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search restaurants and cuisines" className="h-12 rounded-full pl-12 text-base" aria-label="Search venues" />
          {q && (
            <button onClick={() => setQ('')} className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-ink-3 hover:bg-surface-2" aria-label="Clear search">
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:px-0">
          <Chip active={!tag} onClick={() => setTag(undefined)}>
            Everything
          </Chip>
          {(data?.tags ?? []).slice(0, 22).map((t) => (
            <Chip key={t.id} active={tag === t.id} onClick={() => setTag(tag === t.id ? undefined : t.id)}>
              {t.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className={cn('mt-4 transition-opacity', isFetching && !isLoading && 'opacity-60')}>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-[16/10] rounded-xl" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <ErrorState error={error} retry={() => refetch()} />
        ) : venues.length === 0 ? (
          <EmptyState mascot="sniffing" title="No venues here">
            Nothing matches {q ? `“${q}”` : 'that filter'} right now. Try another cuisine.
          </EmptyState>
        ) : (
          <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {venues.map((v, i) => (
              <motion.div key={v.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.025 }}>
                <VenueCard venue={v} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function VenueCard({ venue }: { venue: Venue }) {
  return (
    <Link to={`/explore/${venue.slug}`} className="group block rounded-xl outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">
      <div className="relative">
        <SmartImage
          src={venue.image}
          blurhash={venue.blurhash}
          alt=""
          width={720}
          className="aspect-[16/10] rounded-xl transition-[border-radius] duration-300"
          imgClassName={cn('transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.04]', !venue.online && 'grayscale')}
        />
        {!venue.online && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-[#1b1220]/45">
            <span className="rounded-full bg-surface px-3 py-1 text-[13px] font-semibold text-ink">Closed for now</span>
          </div>
        )}
        {venue.logo && (
          <SmartImage src={venue.logo} alt="" width={120} className="absolute -bottom-4 left-4 size-12 rounded-[14px] border-[3px] border-bg shadow-md" />
        )}
        {venue.deliveryEstimateRange && venue.online && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-surface/95 px-2.5 py-1 text-xs font-bold text-ink shadow-sm backdrop-blur">
            <Clock className="size-3" />
            {venue.deliveryEstimateRange} min
          </span>
        )}
      </div>
      <div className={cn('px-1 pt-3', venue.logo && 'pt-6')}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="truncate font-display text-lg font-bold leading-tight text-ink">{venue.name}</h3>
          {venue.rating && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-ink-2">
              <Star className="size-3.5 fill-biscuit text-biscuit" />
              {venue.rating.score.toFixed(1)}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[13px] text-ink-3">{venue.shortDescription ?? venue.tags.join(', ')}</p>
        <div className="mt-1.5 flex items-center gap-3 text-xs text-ink-3">
          {venue.deliveryPrice && (
            <span className="inline-flex items-center gap-1">
              <Bike className="size-3.5" />
              {venue.deliveryPrice.amount === 0 ? 'Free delivery' : fmtShort(venue.deliveryPrice)}
            </span>
          )}
          {venue.priceRange && <span className="tracking-widest">{'₪'.repeat(venue.priceRange)}</span>}
        </div>
      </div>
    </Link>
  );
}
