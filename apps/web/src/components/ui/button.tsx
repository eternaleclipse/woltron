import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Buttons are tactile: the primary "ball" button sits on a chunky ledge (shadow-ball)
 * that collapses when pressed, like squeezing a tennis ball.
 */
export const buttonVariants = cva(
  [
    'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold',
    'transition-[transform,background-color,box-shadow,color,border-color] duration-200 ease-[var(--ease-spring)]',
    'disabled:opacity-50 disabled:pointer-events-none',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
    '[&_svg]:size-[1.15em] [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        ball: 'bg-ball text-ball-ink shadow-ball hover:bg-ball-hover active:translate-y-[4px] active:shadow-[0_2px_0_-1px_#a3b352] dark:active:shadow-[0_2px_0_-1px_#8e9c45]',
        collar: 'bg-collar text-collar-ink shadow-md hover:-translate-y-px hover:shadow-lg active:translate-y-0 active:scale-[0.97]',
        soft: 'bg-surface-2 text-ink border border-line hover:bg-surface-3 hover:border-line-strong active:scale-[0.97]',
        outline: 'bg-transparent text-ink border border-line-strong hover:bg-surface-2 active:scale-[0.97]',
        ghost: 'bg-transparent text-ink-2 hover:text-ink hover:bg-surface-2 active:scale-[0.96]',
        tongue: 'bg-tongue text-white shadow-[0_5px_0_-1px_#d94c70] hover:brightness-105 active:translate-y-[3px] active:shadow-[0_2px_0_-1px_#d94c70]',
        danger: 'bg-danger-soft text-danger-ink hover:bg-danger hover:text-white active:scale-[0.97]',
        link: 'bg-transparent text-ink underline decoration-ball-deep/60 decoration-2 underline-offset-4 hover:decoration-ball-deep px-0 h-auto',
      },
      size: {
        sm: 'h-8 px-3 text-[13px] rounded-[10px]',
        md: 'h-10 px-4 text-sm rounded-sm',
        lg: 'h-12 px-6 text-[15px] rounded-md',
        xl: 'h-14 px-7 text-base rounded-lg',
        icon: 'size-10 rounded-sm',
        'icon-sm': 'size-8 rounded-[10px]',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0' }],
    defaultVariants: { variant: 'soft', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, children, disabled, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
});
