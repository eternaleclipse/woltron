/** Domain-flavoured building blocks shared across screens. */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Ban, Check, CheckCheck, Clock, ExternalLink, FlaskConical, Hand, Hourglass, Loader2, Package, Radio, X, Zap } from 'lucide-react';
import type { OrderMode, Preset, RunStatus, RunSource, Trigger, VenueOrderStatus } from '@woltron/shared';
import { cn, colorHex, presetImages, fmtCountdown } from '@/lib/utils';
import { Badge } from './ui/primitives';
import { SmartImage } from './ui/controls';
import { Mascot, type MascotState } from './mascot';

// ───────── time ─────────
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function Countdown({ to, className }: { to: string; className?: string }) {
  const now = useNow(1000);
  const ms = new Date(to).getTime() - now;
  return (
    <time dateTime={to} className={cn('tabular', className)}>
      {ms <= 0 ? 'now' : fmtCountdown(ms)}
    </time>
  );
}

// ───────── run status ─────────
type Tone = 'neutral' | 'ball' | 'tongue' | 'biscuit' | 'mint' | 'plum' | 'danger' | 'solid';
export const RUN_STATUS: Record<RunStatus, { label: string; tone: Tone; icon: ReactNode; active?: boolean; mascot: MascotState }> = {
  pending: { label: 'Starting', tone: 'plum', icon: <Loader2 className="animate-spin" />, active: true, mascot: 'sniffing' },
  'awaiting-confirmation': { label: 'Needs your OK', tone: 'biscuit', icon: <Hand />, active: true, mascot: 'idle' },
  placing: { label: 'Fetching', tone: 'ball', icon: <Loader2 className="animate-spin" />, active: true, mascot: 'sniffing' },
  placed: { label: 'Placed', tone: 'mint', icon: <Check />, mascot: 'happy' },
  'handed-off': { label: 'Finish in Wolt', tone: 'biscuit', icon: <ExternalLink />, mascot: 'happy' },
  simulated: { label: 'Dry run done', tone: 'plum', icon: <FlaskConical />, mascot: 'happy' },
  delivered: { label: 'Delivered', tone: 'mint', icon: <CheckCheck />, mascot: 'eating' },
  skipped: { label: 'Skipped', tone: 'neutral', icon: <Ban />, mascot: 'sleeping' },
  failed: { label: 'Failed', tone: 'danger', icon: <AlertTriangle />, mascot: 'sad' },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: <X />, mascot: 'sleeping' },
  expired: { label: 'Expired', tone: 'neutral', icon: <Hourglass />, mascot: 'sleeping' },
};

export function RunStatusBadge({ status, size = 'md' }: { status: RunStatus; size?: 'sm' | 'md' | 'lg' }) {
  const s = RUN_STATUS[status];
  return (
    <Badge tone={s.tone} size={size}>
      {s.icon}
      {s.label}
    </Badge>
  );
}

export const VENUE_STATUS: Record<VenueOrderStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Queued', tone: 'neutral' },
  validating: { label: 'Checking', tone: 'plum' },
  ready: { label: 'Ready', tone: 'ball' },
  placing: { label: 'Placing', tone: 'ball' },
  placed: { label: 'Placed', tone: 'mint' },
  'handed-off': { label: 'In your Wolt basket', tone: 'biscuit' },
  simulated: { label: 'Simulated', tone: 'plum' },
  'in-delivery': { label: 'On the way', tone: 'mint' },
  delivered: { label: 'Delivered', tone: 'mint' },
  failed: { label: 'Failed', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'neutral' },
};

export const SOURCE_LABEL: Record<RunSource, string> = {
  manual: 'You',
  schedule: 'Schedule',
  once: 'One-off',
  webhook: 'Webhook',
  'venue-online': 'Venue opened',
  fetch: 'Fetch',
  tray: 'Tray',
  deeplink: 'Link',
};

// ───────── order mode ─────────
export const MODE_META: Record<OrderMode, { label: string; short: string; tone: Tone; icon: ReactNode; explain: string }> = {
  'dry-run': { label: 'Dry run', short: 'Dry run', tone: 'plum', icon: <FlaskConical />, explain: 'Prices everything out, orders nothing.' },
  live: { label: 'Live orders', short: 'Live', tone: 'tongue', icon: <Zap />, explain: 'Places real orders and spends real money.' },
  handoff: { label: 'Handoff', short: 'Handoff', tone: 'biscuit', icon: <ExternalLink />, explain: 'Fills your Wolt basket; you tap Pay.' },
};

export function ModePill({ mode, className, to = '/settings#order-mode', short }: { mode: OrderMode; className?: string; to?: string | null; short?: boolean }) {
  const m = MODE_META[mode];
  const inner = (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-full pl-2.5 pr-3 text-[13px] font-semibold [&_svg]:size-3.5',
        mode === 'live' ? 'bg-tongue text-white' : mode === 'handoff' ? 'bg-biscuit-soft text-biscuit-ink' : 'bg-plum-soft text-plum-ink',
        className,
      )}
    >
      {mode === 'live' ? <span className="pulse-dot size-2 rounded-full bg-white" /> : m.icon}
      {short ? (mode === 'live' ? 'Live order' : m.short) : m.label}
    </span>
  );
  return to ? (
    <Link to={to} className="rounded-full" aria-label={`Order mode: ${m.label}. Change in settings`}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

// ───────── triggers ─────────
export function TriggerIcon({ trigger, className }: { trigger: Trigger['type']; className?: string }) {
  const Icon = { schedule: Clock, once: Package, webhook: Zap, 'venue-online': Radio }[trigger];
  const tone = {
    schedule: 'bg-ball-soft text-ball-deep',
    once: 'bg-biscuit-soft text-biscuit-ink',
    webhook: 'bg-tongue-soft text-tongue-ink',
    'venue-online': 'bg-mint-soft text-mint-ink',
  }[trigger];
  return (
    <span className={cn('grid size-11 shrink-0 place-items-center rounded-[14px]', tone, className)}>
      <Icon className="size-5" />
    </span>
  );
}

export const TRIGGER_LABEL: Record<Trigger['type'], string> = {
  schedule: 'Schedule',
  once: 'One time',
  webhook: 'Webhook',
  'venue-online': 'When a venue opens',
};

// ───────── preset visuals ─────────
/** A 1–4 image mosaic from a preset's items, with the preset emoji badge. */
export function Collage({
  preset,
  className,
  rounded = 'rounded-lg',
  showEmoji = true,
  style,
}: {
  preset: Pick<Preset, 'items' | 'emoji' | 'color'>;
  className?: string;
  rounded?: string;
  showEmoji?: boolean;
  style?: CSSProperties;
}) {
  const imgs = presetImages(preset, 4);
  const n = imgs.length;
  return (
    <div className={cn('relative overflow-hidden', rounded, className)} style={{ background: colorHex(preset.color), ...style }}>
      {n === 0 ? (
        <div className="grid size-full place-items-center text-5xl">{preset.emoji}</div>
      ) : (
        <div className={cn('grid size-full gap-[3px]', n === 1 ? 'grid-cols-1' : 'grid-cols-2', n >= 3 && 'grid-rows-2')}>
          {imgs.map((src, i) => (
            <SmartImage
              key={src}
              src={src}
              alt=""
              width={360}
              className={cn('size-full', n === 3 && i === 0 && 'row-span-2')}
            />
          ))}
        </div>
      )}
      {showEmoji && n > 0 && (
        <span
          className="absolute bottom-2.5 left-2.5 grid size-10 place-items-center rounded-[14px] text-xl shadow-md ring-2 ring-surface"
          style={{ background: colorHex(preset.color) }}
          aria-hidden
        >
          {preset.emoji}
        </span>
      )}
    </div>
  );
}

// ───────── empty / error states ─────────
export function EmptyState({
  mascot = 'sleeping',
  title,
  children,
  action,
  className,
  compact,
}: {
  mascot?: MascotState;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 py-8' : 'gap-3 py-16', className)}>
      <Mascot state={mascot} size={compact ? 88 : 132} />
      <h3 className={cn('font-display font-bold text-ink', compact ? 'text-lg' : 'text-2xl')}>{title}</h3>
      {children && <p className="max-w-sm text-[15px] text-ink-2">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <EmptyState mascot="sad" title="Couldn’t fetch that" action={retry && <button className="font-semibold underline decoration-2 underline-offset-4" onClick={retry}>Try again</button>}>
      {error instanceof Error ? error.message : 'Something went wrong talking to the server.'}
    </EmptyState>
  );
}

// ───────── page header ─────────
export function PageHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn('mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8', className)}>
      <div className="min-w-0">
        <h1 className="font-display text-[34px] font-extrabold leading-[1.05] text-ink lg:text-[44px]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-xl text-[15px] text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="tabular font-display text-lg font-bold leading-tight text-ink">{value}</div>
      <div className="text-xs text-ink-3">{label}</div>
    </div>
  );
}

