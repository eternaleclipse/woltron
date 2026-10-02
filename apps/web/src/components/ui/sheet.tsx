/**
 * Responsive sheet: a centered dialog on desktop, a bottom drawer (vaul) on mobile.
 * Same API everywhere so screens don't care which one they get.
 */
import type { ReactNode } from 'react';
import { Dialog, VisuallyHidden } from 'radix-ui';
import { Drawer } from 'vaul';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsDesktop } from '@/lib/prefs';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Visual header slot above the title (image, mascot…). */
  hero?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  hideTitle?: boolean;
  className?: string;
}

export function Sheet({ open, onOpenChange, title, description, children, footer, hero, size = 'md', hideTitle, className }: SheetProps) {
  const desktop = useIsDesktop();
  const titleNode = (
    <div className={cn('px-6 pt-5', hideTitle && 'sr-only')}>
      <h2 className="font-display text-2xl font-bold leading-tight text-ink">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
    </div>
  );

  if (desktop) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[#1b1220]/45 backdrop-blur-[3px] data-[state=open]:animate-[fade-in_200ms_ease-out] data-[state=closed]:animate-[fade-out_150ms_ease-in]" />
          <Dialog.Content
            className={cn(
              'fixed left-1/2 top-1/2 z-50 flex max-h-[min(88dvh,820px)] w-[calc(100vw-48px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lg outline-none',
              'data-[state=open]:animate-[sheet-in_320ms_var(--ease-spring)] data-[state=closed]:animate-[sheet-out_140ms_ease-in]',
              size === 'sm' && 'max-w-md',
              size === 'md' && 'max-w-xl',
              size === 'lg' && 'max-w-3xl',
              className,
            )}
          >
            {hero}
            <Dialog.Title asChild>
              <div>{titleNode}</div>
            </Dialog.Title>
            {!description && (
              <VisuallyHidden.Root>
                <Dialog.Description>{typeof title === 'string' ? title : 'Dialog'}</Dialog.Description>
              </VisuallyHidden.Root>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">{children}</div>
            {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-6 py-4">{footer}</div>}
            <Dialog.Close
              className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-surface/90 text-ink-2 backdrop-blur transition-colors hover:bg-surface-3 hover:text-ink"
              aria-label="Close"
            >
              <X className="size-4" />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-[#1b1220]/50" />
        <Drawer.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[28px] border-t border-line bg-surface outline-none',
            className,
          )}
        >
          <div className="absolute left-1/2 top-2 z-10 h-1.5 w-11 -translate-x-1/2 rounded-full bg-ink-3/40" aria-hidden />
          {hero}
          <Drawer.Title asChild>
            <div className={cn(!hero && 'pt-3')}>{titleNode}</div>
          </Drawer.Title>
          <Drawer.Description className="sr-only">{typeof title === 'string' ? title : 'Sheet'}</Drawer.Description>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">{children}</div>
          {footer && <div className="flex items-center gap-2 border-t border-line bg-surface-2 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 [&>button]:flex-1">{footer}</div>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
