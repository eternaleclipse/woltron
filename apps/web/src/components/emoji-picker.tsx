import { useState } from 'react';
import { Popover } from 'radix-ui';
import { cn } from '@/lib/utils';

const EMOJI = [
  '🍣', '🍜', '🍱', '🥢', '🥡', '🍙', '🍤', '🥟',
  '🍕', '🍝', '🧀', '🥗', '🥙', '🌯', '🌮', '🧆',
  '🍔', '🍟', '🌭', '🍗', '🥩', '🍖', '🥓', '🍳',
  '🥐', '🥯', '🧇', '🥞', '🍰', '🍩', '🍪', '🍨',
  '🍦', '🧁', '🍫', '☕', '🧋', '🥤', '🍺', '🍷',
  '🥑', '🌶️', '🥦', '🍋', '🍓', '🍉', '🎾', '🐶',
  '🦴', '🐾', '🛋️', '🎲', '🔥', '⚡', '🌙', '🎉',
];

export function EmojiPicker({ value, onChange, size = 'md' }: { value: string; onChange: (e: string) => void; size?: 'md' | 'lg' }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`Emoji: ${value}. Change`}
        className={cn(
          'grid shrink-0 place-items-center rounded-md border border-line-strong bg-surface transition-transform duration-200 ease-[var(--ease-spring)] hover:scale-105 active:scale-95',
          size === 'lg' ? 'size-16 text-4xl' : 'size-11 text-2xl',
        )}
      >
        {value}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          align="start"
          className="z-[70] w-[300px] rounded-lg border border-line bg-surface p-2 shadow-lg data-[state=open]:animate-[pop-in_180ms_var(--ease-spring)]"
        >
          <div className="grid grid-cols-8 gap-0.5" role="listbox" aria-label="Pick an emoji">
            {EMOJI.map((e) => (
              <button
                key={e}
                role="option"
                aria-selected={e === value}
                onClick={() => {
                  onChange(e);
                  setOpen(false);
                }}
                className={cn('grid size-9 place-items-center rounded-[10px] text-xl transition-transform hover:scale-125 hover:bg-surface-2', e === value && 'bg-ball-soft')}
              >
                {e}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
