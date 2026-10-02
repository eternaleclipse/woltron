import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, Compass, Dices, House, Menu as MenuIcon, Receipt, Search, Settings2, ShoppingBasket, WifiOff } from 'lucide-react';
import { useRuns, useSettings } from '@/lib/queries';
import { useConnectionState } from '@/lib/sse';
import { useMascotName } from '@/lib/prefs';
import { cn, modKey } from '@/lib/utils';
import { TennisBall, Wordmark } from './brand';
import { ModePill } from './bits';
import { Mascot } from './mascot';
import { Kbd } from './ui/primitives';
import { Sheet } from './ui/sheet';
import { useCommandPalette } from './command-palette';

export const NAV = [
  { to: '/', label: 'Kennel', icon: House, key: 'h' },
  { to: '/fetch', label: 'Fetch', icon: null, key: 'f' },
  { to: '/explore', label: 'Explore', icon: Compass, key: 'e' },
  { to: '/presets', label: 'Presets', icon: ShoppingBasket, key: 'p' },
  { to: '/packs', label: 'Packs', icon: Dices, key: 'k' },
  { to: '/automations', label: 'Automations', icon: CalendarClock, key: 'a' },
  { to: '/runs', label: 'Runs', icon: Receipt, key: 'r' },
  { to: '/settings', label: 'Settings', icon: Settings2, key: 's' },
] as const;

function useAwaitingCount() {
  const { data } = useRuns();
  return data?.filter((r) => r.status === 'awaiting-confirmation').length ?? 0;
}

export function AppShell() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);
  useGoShortcuts();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <div className="titlebar-drag" aria-hidden />
      <Sidebar />
      <div className="min-w-0">
        <MobileTopBar />
        <ConnectionBanner />
        <main ref={mainRef} id="main" className="mx-auto w-full max-w-[1180px] px-4 pb-32 pt-4 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">
          <Outlet />
        </main>
      </div>
      <BottomTabs />
    </div>
  );
}

function Sidebar() {
  const { data: settings } = useSettings();
  const awaiting = useAwaitingCount();
  const palette = useCommandPalette();
  const name = useMascotName();
  return (
    <aside className="desktop-sidebar sticky top-0 hidden h-dvh flex-col border-r border-line bg-bg px-4 py-6 lg:flex">
      <NavLink to="/" className="mb-8 px-3" aria-label="Woltron home">
        <Wordmark size={30} />
      </NavLink>

      <button
        onClick={() => palette.open()}
        className="mb-5 flex h-10 items-center gap-2.5 rounded-sm border border-line-strong bg-surface px-3 text-left text-sm text-ink-3 transition-colors hover:border-ink-3 hover:text-ink-2"
      >
        <Search className="size-4" />
        <span className="flex-1">Find or run…</span>
        <Kbd>{modKey}</Kbd>
        <Kbd>K</Kbd>
      </button>

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className="group relative rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-focus">
            {({ isActive }) => (
              <span
                className={cn(
                  'relative flex h-11 items-center gap-3 rounded-sm px-3 text-[15px] font-semibold transition-colors',
                  isActive ? 'text-collar-ink' : 'text-ink-2 group-hover:bg-surface-2 group-hover:text-ink',
                )}
              >
                {isActive && (
                  <motion.span layoutId="nav-active" className="absolute inset-0 rounded-sm bg-collar" transition={{ type: 'spring', stiffness: 480, damping: 38 }} />
                )}
                <span className="relative z-10 grid size-6 place-items-center">
                  {n.icon ? <n.icon className="size-[19px]" /> : <TennisBall size={19} />}
                </span>
                <span className="relative z-10 flex-1">{n.label}</span>
                {n.to === '/runs' && awaiting > 0 && (
                  <span className="relative z-10 grid h-5 min-w-5 place-items-center rounded-full bg-tongue px-1.5 text-2xs font-bold text-white">{awaiting}</span>
                )}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-3">
        {settings && (
          <div className="px-1">
            <ModePill mode={settings.orderMode} />
          </div>
        )}
        <div className="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
          <Mascot state="idle" size={44} />
          <div className="min-w-0 text-[13px] leading-snug">
            <div className="font-semibold text-ink">{name} is on duty</div>
            <div className="text-ink-3">
              {settings?.wolt.connected ? `Connected as ${settings.wolt.user?.name?.split(' ')[0] ?? 'you'}` : 'Wolt not connected'}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MobileTopBar() {
  const { data: settings } = useSettings();
  const palette = useCommandPalette();
  return (
    <div className="mobile-topbar pt-safe sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-xl lg:hidden">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <NavLink to="/" aria-label="Woltron home">
          <Wordmark size={24} />
        </NavLink>
        <div className="flex items-center gap-2">
          {settings && <ModePill mode={settings.orderMode} />}
          <button onClick={() => palette.open()} className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-2" aria-label="Search and commands">
            <Search className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { to: '/', label: 'Kennel', icon: House },
  { to: '/presets', label: 'Presets', icon: ShoppingBasket },
  { to: '/fetch', label: 'Fetch', icon: null },
  { to: '/runs', label: 'Runs', icon: Receipt },
] as const;

function BottomTabs() {
  const [more, setMore] = useState(false);
  const loc = useLocation();
  const awaiting = useAwaitingCount();
  const inMore = ['/explore', '/packs', '/automations', '/settings'].some((p) => loc.pathname.startsWith(p));
  return (
    <>
      <nav
        aria-label="Main"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
          {TABS.map((t) =>
            t.icon === null ? (
              <NavLink key={t.to} to={t.to} className="flex justify-center" aria-label="Fetch">
                {({ isActive }) => (
                  <motion.span
                    whileTap={{ scale: 0.88 }}
                    className={cn(
                      '-mt-8 grid size-16 place-items-center rounded-full bg-ball shadow-ball ring-[5px] ring-bg transition-transform',
                      isActive && 'rotate-[30deg]',
                    )}
                  >
                    <TennisBall size={40} />
                  </motion.span>
                )}
              </NavLink>
            ) : (
              <TabLink key={t.to} to={t.to} label={t.label} icon={<t.icon className="size-[22px]" />} badge={t.to === '/runs' ? awaiting : 0} />
            ),
          )}
          <button
            onClick={() => setMore(true)}
            className={cn('flex flex-col items-center gap-0.5 text-[11px] font-semibold', inMore ? 'text-ink' : 'text-ink-3')}
          >
            <MenuIcon className="size-[22px]" />
            More
          </button>
        </div>
      </nav>
      <MoreSheet open={more} onOpenChange={setMore} />
    </>
  );
}

function TabLink({ to, label, icon, badge }: { to: string; label: string; icon: ReactNode; badge?: number }) {
  return (
    <NavLink to={to} end={to === '/'} className="flex flex-col items-center">
      {({ isActive }) => (
        <span className={cn('relative flex flex-col items-center gap-0.5 text-[11px] font-semibold transition-colors', isActive ? 'text-ink' : 'text-ink-3')}>
          <span className={cn('grid h-7 w-12 place-items-center rounded-full transition-colors', isActive && 'bg-ball-soft text-ink')}>{icon}</span>
          {label}
          {!!badge && <span className="absolute -top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-tongue px-1 text-[10px] font-bold text-white">{badge}</span>}
        </span>
      )}
    </NavLink>
  );
}

function MoreSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const items = NAV.filter((n) => ['/explore', '/packs', '/automations', '/settings'].includes(n.to));
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="More places to sniff">
      <div className="grid grid-cols-2 gap-3">
        {items.map((n) => (
          <button
            key={n.to}
            onClick={() => {
              onOpenChange(false);
              navigate(n.to);
            }}
            className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface-2 p-4 text-left font-semibold transition-transform active:scale-[0.97]"
          >
            <span className="grid size-10 place-items-center rounded-[14px] bg-surface text-ink shadow-sm">{n.icon && <n.icon className="size-5" />}</span>
            {n.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function ConnectionBanner() {
  const state = useConnectionState();
  return (
    <AnimatePresence>
      {state === 'lost' && (
        <motion.div
          role="status"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <div className="flex items-center justify-center gap-2.5 bg-biscuit px-4 py-2 text-[13px] font-semibold text-[#3d2400]">
            <WifiOff className="size-4" />
            Lost the scent — reconnecting to Woltron…
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** "g" then a letter jumps between screens. */
function useGoShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    let armed = false;
    let t: ReturnType<typeof setTimeout>;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (armed) {
        armed = false;
        const hit = NAV.find((n) => n.key === e.key.toLowerCase());
        if (hit) {
          e.preventDefault();
          navigate(hit.to);
        }
        return;
      }
      if (e.key === 'g') {
        armed = true;
        clearTimeout(t);
        t = setTimeout(() => (armed = false), 900);
      } else if (e.key === '/') {
        e.preventDefault();
        navigate('/fetch');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}
