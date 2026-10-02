import { useId, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { DropdownMenu, Tooltip as RTooltip } from 'radix-ui';
import { Minus, Plus } from 'lucide-react';
import { decode } from 'blurhash';
import { useEffect, useRef } from 'react';
import { cn, sized } from '@/lib/utils';

// ───────── Segmented control ─────────
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode; icon?: ReactNode }>;
  className?: string;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-md border border-line bg-surface-2 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative flex flex-1 items-center justify-center gap-1.5 rounded-[11px] font-semibold transition-colors duration-200 [&_svg]:size-4',
              size === 'md' ? 'h-9 px-3.5 text-[13px]' : 'h-7 px-2.5 text-xs',
              active ? 'text-collar-ink' : 'text-ink-2 hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-[11px] bg-collar shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {o.icon}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ───────── Quantity stepper ─────────
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  size = 'md',
  label = 'Quantity',
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const btn = cn(
    'grid place-items-center rounded-full text-ink transition-[background-color,transform] duration-200 ease-[var(--ease-spring)] hover:bg-surface-3 active:scale-90 disabled:opacity-30',
    size === 'md' ? 'size-9' : 'size-7',
  );
  return (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-full border border-line-strong bg-surface p-0.5">
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Decrease">
        <Minus className="size-4" />
      </button>
      <motion.span
        key={value}
        initial={{ y: -6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={cn('tabular text-center font-bold', size === 'md' ? 'w-8 text-[15px]' : 'w-6 text-[13px]')}
        aria-live="polite"
      >
        {value}
      </motion.span>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Increase">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

// ───────── Image with blurhash / skeleton placeholder ─────────
function Blur({ hash }: { hash: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    try {
      const px = decode(hash, 32, 32);
      const ctx = ref.current?.getContext('2d');
      if (!ctx) return;
      const img = ctx.createImageData(32, 32);
      img.data.set(px);
      ctx.putImageData(img, 0, 0);
    } catch {
      /* bad hash */
    }
  }, [hash]);
  return <canvas ref={ref} width={32} height={32} className="absolute inset-0 size-full" aria-hidden />;
}

export function SmartImage({
  src,
  alt,
  blurhash,
  className,
  imgClassName,
  width = 480,
  fallback,
}: {
  src?: string;
  alt: string;
  blurhash?: string;
  className?: string;
  imgClassName?: string;
  width?: number;
  fallback?: ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = sized(src, width);
  return (
    <div className={cn('relative overflow-hidden bg-surface-3', className)}>
      {!loaded && !failed && (blurhash ? <Blur hash={blurhash} /> : <div className="skeleton absolute inset-0" />)}
      {url && !failed ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn('absolute inset-0 size-full object-cover transition-opacity duration-500', loaded ? 'opacity-100' : 'opacity-0', imgClassName)}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-3xl">{fallback ?? '🍽️'}</div>
      )}
    </div>
  );
}

// ───────── Tooltip ─────────
export function Tip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <RTooltip.Root delayDuration={250}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={8}
          className="z-[60] rounded-[10px] bg-collar px-2.5 py-1.5 text-xs font-semibold text-collar-ink shadow-md data-[state=delayed-open]:animate-[pop-in_160ms_var(--ease-spring)]"
        >
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

// ───────── Dropdown menu ─────────
export function Menu({
  trigger,
  items,
  align = 'end',
}: {
  trigger: ReactNode;
  items: Array<{ label: ReactNode; icon?: ReactNode; onSelect: () => void; danger?: boolean } | 'sep'>;
  align?: 'start' | 'end';
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className="z-[60] min-w-48 rounded-md border border-line bg-surface p-1.5 shadow-lg data-[state=open]:animate-[pop-in_180ms_var(--ease-spring)]"
        >
          {items.map((it, i) =>
            it === 'sep' ? (
              <DropdownMenu.Separator key={i} className="my-1 h-px bg-line" />
            ) : (
              <DropdownMenu.Item
                key={i}
                onSelect={it.onSelect}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm font-medium outline-none data-[highlighted]:bg-surface-2 [&_svg]:size-4',
                  it.danger ? 'text-danger-ink' : 'text-ink',
                )}
              >
                {it.icon}
                {it.label}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
