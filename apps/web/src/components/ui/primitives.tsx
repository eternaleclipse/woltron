/** Small presentational primitives: Card, Badge, Input, Textarea, Field, Skeleton, Kbd, Switch, Chip. */
import { forwardRef, useId, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Switch as RSwitch } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// ───────── Card ─────────
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { interactive?: boolean }>(function Card(
  { className, interactive, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border border-line bg-surface shadow-sm',
        interactive &&
          'transition-[transform,box-shadow,border-color] duration-300 ease-[var(--ease-spring)] hover:-translate-y-1 hover:shadow-md hover:border-line-strong focus-within:border-line-strong',
        className,
      )}
      {...props}
    />
  );
});

// ───────── Badge ─────────
export const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap [&_svg]:size-3.5', {
  variants: {
    tone: {
      neutral: 'bg-surface-3 text-ink-2',
      ball: 'bg-ball-soft text-ball-deep',
      tongue: 'bg-tongue-soft text-tongue-ink',
      biscuit: 'bg-biscuit-soft text-biscuit-ink',
      mint: 'bg-mint-soft text-mint-ink',
      plum: 'bg-plum-soft text-plum-ink',
      danger: 'bg-danger-soft text-danger-ink',
      solid: 'bg-collar text-collar-ink',
    },
    size: {
      sm: 'h-5 px-2 text-2xs',
      md: 'h-6 px-2.5 text-xs',
      lg: 'h-8 px-3 text-[13px]',
    },
  },
  defaultVariants: { tone: 'neutral', size: 'md' },
});
export function Badge({ className, tone, size, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

// ───────── Inputs ─────────
const fieldBase =
  'w-full rounded-sm border border-line-strong bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] duration-150 outline-none focus:border-ink focus:shadow-[0_0_0_4px_var(--ball-soft)] disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(fieldBase, 'h-11', className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, 'min-h-[88px] py-2.5 leading-relaxed resize-y', className)} {...props} />;
});

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs font-medium text-danger-ink">{error}</p> : hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

// ───────── Switch ─────────
export function Switch({
  checked,
  onCheckedChange,
  label,
  className,
  disabled,
  size = 'md',
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <RSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      disabled={disabled}
      className={cn(
        'group relative inline-flex shrink-0 items-center rounded-full border border-line-strong bg-surface-3 transition-colors duration-200',
        'data-[state=checked]:border-transparent data-[state=checked]:bg-ball disabled:opacity-50',
        size === 'md' ? 'h-7 w-12' : 'h-6 w-10',
        className,
      )}
    >
      <RSwitch.Thumb
        className={cn(
          'block rounded-full bg-surface shadow-sm transition-transform duration-300 ease-[var(--ease-spring)] dark:bg-ink-3',
          'data-[state=checked]:bg-collar dark:data-[state=checked]:bg-[#2b1a33]',
          size === 'md' ? 'size-5 translate-x-[3px] data-[state=checked]:translate-x-[23px]' : 'size-4 translate-x-[3px] data-[state=checked]:translate-x-[19px]',
        )}
      />
    </RSwitch.Root>
  );
}

export function SwitchRow({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  title: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[15px] font-semibold text-ink">
          {title}
        </label>
        {description && <p className="mt-0.5 text-[13px] text-ink-2">{description}</p>}
      </div>
      <RSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="group relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-line-strong bg-surface-3 transition-colors duration-200 data-[state=checked]:border-transparent data-[state=checked]:bg-ball disabled:opacity-50"
      >
        <RSwitch.Thumb className="block size-5 translate-x-[3px] rounded-full bg-surface shadow-sm transition-transform duration-300 ease-[var(--ease-spring)] data-[state=checked]:translate-x-[23px] data-[state=checked]:bg-[#2b1a33] dark:bg-ink-3" />
      </RSwitch.Root>
    </div>
  );
}

// ───────── Chip (toggleable filter) ─────────
export const Chip = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }>(function Chip(
  { className, active, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease-spring)] active:scale-95 [&_svg]:size-4',
        active ? 'border-transparent bg-collar text-collar-ink' : 'border-line-strong bg-surface text-ink-2 hover:border-ink-3 hover:text-ink',
        className,
      )}
      {...props}
    />
  );
});

// ───────── Skeleton ─────────
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('skeleton rounded-md', className)} {...props} />;
}

// ───────── Kbd ─────────
export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-line-strong border-b-2 bg-surface px-1 font-sans text-2xs font-semibold text-ink-2',
        className,
      )}
      {...props}
    />
  );
}

// ───────── Section heading ─────────
export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <h2 className="font-display text-xl font-bold text-ink">{children}</h2>
      {action}
    </div>
  );
}
