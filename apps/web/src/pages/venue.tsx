import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Bike, Clock, ExternalLink, Plus, Star } from 'lucide-react';
import type { MenuItem } from '@woltron/shared';
import { useMenu } from '@/lib/queries';
import { cn, fmtShort } from '@/lib/utils';
import { EmptyState, ErrorState } from '@/components/bits';
import { ItemSheet } from '@/components/item-sheet';
import { Badge, Skeleton } from '@/components/ui/primitives';
import { SmartImage } from '@/components/ui/controls';
import { Button } from '@/components/ui/button';

export function VenuePage() {
  const { slug } = useParams();
  const { data: menu, isLoading, isError, error, refetch } = useMenu(slug);
  const [item, setItem] = useState<MenuItem | null>(null);
  const [open, setOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<string | undefined>();
  const navRef = useRef<HTMLDivElement>(null);

  // Scroll-spy for the category nav
  useEffect(() => {
    if (!menu) return;
    const els = menu.categories.map((c) => document.getElementById(`cat-${c.id}`)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActiveCat(vis.target.id.slice(4));
      },
      { rootMargin: '-140px 0px -60% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [menu]);

  useEffect(() => {
    if (!activeCat) return;
    navRef.current?.querySelector(`[data-cat="${activeCat}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeCat]);

  if (isLoading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-64 rounded-xl lg:h-80" />
        <Skeleton className="h-10 w-1/2" />
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  if (isError || !menu) return <ErrorState error={error} retry={() => refetch()} />;
  const v = menu.venue;
  const byId = new Map(menu.items.map((i) => [i.id, i]));

  return (
    <div>
      <div className="relative -mx-4 -mt-4 sm:-mx-6 lg:mx-0 lg:mt-0">
        <SmartImage src={v.image} blurhash={v.blurhash} alt="" width={1400} className="h-60 sm:h-72 lg:h-80 lg:rounded-xl" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1b1220]/85 via-[#1b1220]/20 to-transparent lg:rounded-xl" />
        <Link
          to="/explore"
          className="absolute left-4 top-4 grid size-10 place-items-center rounded-full bg-surface/90 text-ink shadow-md backdrop-blur transition-transform hover:scale-105"
          aria-label="Back to explore"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-5 lg:p-7">
          {v.logo && <SmartImage src={v.logo} alt="" width={160} className="hidden size-20 shrink-0 rounded-[20px] border-4 border-white/90 shadow-lg sm:block" />}
          <div className="min-w-0 text-white">
            <h1 className="font-display text-3xl font-extrabold leading-none tracking-tight lg:text-[44px]">{v.name}</h1>
            {v.shortDescription && <p className="mt-2 line-clamp-2 max-w-xl text-[15px] text-white/80">{v.shortDescription}</p>}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone={v.online ? 'mint' : 'neutral'} size="lg">
          <span className={cn('size-2 rounded-full', v.online ? 'bg-mint' : 'bg-ink-3')} />
          {v.online ? 'Open now' : 'Closed'}
        </Badge>
        {v.rating && (
          <Badge size="lg" tone="biscuit">
            <Star className="fill-current" /> {v.rating.score.toFixed(1)}
            {v.rating.volume ? <span className="font-medium opacity-70">({v.rating.volume.toLocaleString()})</span> : null}
          </Badge>
        )}
        {v.deliveryEstimateRange && (
          <Badge size="lg">
            <Clock /> {v.deliveryEstimateRange} min
          </Badge>
        )}
        {v.deliveryPrice && (
          <Badge size="lg">
            <Bike /> {fmtShort(v.deliveryPrice)}
          </Badge>
        )}
        {v.url && (
          <Button variant="ghost" size="sm" asChild className="ml-auto">
            <a href={v.url} target="_blank" rel="noreferrer">
              Open in Wolt <ExternalLink />
            </a>
          </Button>
        )}
      </div>

      {menu.categories.length === 0 ? (
        <EmptyState mascot="sniffing" title="No menu to sniff">
          This venue isn’t sharing its menu right now. Try again in a bit.
        </EmptyState>
      ) : (
        <>
          <div ref={navRef} className="sticky-under-titlebar no-scrollbar sticky top-14 z-20 -mx-4 mt-6 flex gap-1.5 overflow-x-auto border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-0 lg:mx-0 lg:px-0">
            {menu.categories.map((c) => (
              <a
                key={c.id}
                data-cat={c.id}
                href={`#cat-${c.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(`cat-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={cn(
                  'shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                  activeCat === c.id ? 'bg-collar text-collar-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )}
              >
                {c.name}
              </a>
            ))}
          </div>

          <div className="mt-6 space-y-10">
            {menu.categories.map((c) => (
              <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-32">
                <h2 className="mb-3 font-display text-2xl font-bold">{c.name}</h2>
                {c.description && <p className="-mt-2 mb-3 text-sm text-ink-2">{c.description}</p>}
                <div className="grid gap-3 lg:grid-cols-2">
                  {c.itemIds.map((iid) => {
                    const it = byId.get(iid);
                    if (!it) return null;
                    return (
                      <ItemCard
                        key={iid}
                        item={it}
                        onClick={() => {
                          setItem(it);
                          setOpen(true);
                        }}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      <ItemSheet item={item} venue={v} open={open} onOpenChange={setOpen} />
    </div>
  );
}

function ItemCard({ item, onClick }: { item: MenuItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!item.available}
      className="group flex w-full items-stretch gap-4 rounded-lg border border-line bg-surface p-3 text-left shadow-sm transition-[transform,box-shadow,border-color] duration-300 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md disabled:opacity-50"
    >
      <div className="flex min-w-0 flex-1 flex-col py-1">
        <h3 className="line-clamp-2 font-semibold leading-snug text-ink">{item.name}</h3>
        {item.description && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-3">{item.description}</p>}
        <div className="mt-auto flex items-center gap-2 pt-2">
          <span className="tabular font-display font-bold text-ink">{fmtShort(item.price)}</span>
          {item.dietary?.slice(0, 2).map((d) => (
            <Badge key={d} tone="mint" size="sm">
              {d}
            </Badge>
          ))}
          {!item.available && <Badge size="sm">Sold out</Badge>}
        </div>
      </div>
      <div className="relative shrink-0">
        <SmartImage src={item.image} blurhash={item.blurhash} alt="" width={280} className="size-28 rounded-[16px]" />
        <span className="absolute -bottom-1.5 -right-1.5 grid size-9 place-items-center rounded-full bg-ball text-ball-ink shadow-md ring-[3px] ring-surface transition-transform duration-300 ease-[var(--ease-spring)] group-hover:scale-110 group-hover:rotate-90">
          <Plus className="size-4" strokeWidth={3} />
        </span>
      </div>
    </button>
  );
}
