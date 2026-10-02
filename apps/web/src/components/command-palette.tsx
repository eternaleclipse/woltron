import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Command } from 'cmdk';
import { Dialog, VisuallyHidden } from 'radix-ui';
import { CalendarPlus, Moon, Play, Plus, Search, Sun } from 'lucide-react';
import { usePacks, usePatchSettings, usePresets, useSettings } from '@/lib/queries';
import { useIsDark } from '@/lib/prefs';
import { fmtShort, modKey, presetTotal } from '@/lib/utils';
import { useRunLauncher } from './run-launcher';
import { TennisBall } from './brand';
import { Kbd } from './ui/primitives';
import { NAV } from './shell';

const Ctx = createContext<{ open: () => void }>({ open: () => {} });
export const useCommandPalette = () => useContext(Ctx);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const value = useMemo(() => ({ open: () => setOpen(true) }), []);
  return (
    <Ctx.Provider value={value}>
      {children}
      <Palette open={open} onOpenChange={setOpen} />
    </Ctx.Provider>
  );
}

function Palette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const { data: presets } = usePresets();
  const { data: packs } = usePacks();
  const { launch } = useRunLauncher();
  const patch = usePatchSettings();
  const { data: settings } = useSettings();
  const dark = useIsDark();
  const [q, setQ] = useState('');

  const run = useCallback(
    (fn: () => void) => {
      onOpenChange(false);
      setQ('');
      // let the dialog close before opening sheets
      setTimeout(fn, 60);
    },
    [onOpenChange],
  );

  const item =
    'flex cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2.5 text-[15px] text-ink aria-selected:bg-surface-2 data-[selected=true]:bg-surface-2 [&_svg]:size-[18px] [&_svg]:text-ink-2';
  const group = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-ink-3';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#1b1220]/40 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <Dialog.Content className="fixed left-1/2 top-[12dvh] z-50 w-[calc(100vw-24px)] max-w-[620px] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-lg outline-none data-[state=open]:animate-[pop-in_220ms_var(--ease-spring)]">
          <VisuallyHidden.Root>
            <Dialog.Title>Command palette</Dialog.Title>
            <Dialog.Description>Search screens, run presets and packs, or create something new.</Dialog.Description>
          </VisuallyHidden.Root>
          <Command loop className="flex max-h-[70dvh] flex-col">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-5 text-ink-3" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Run a preset, jump somewhere, make something…"
                className="h-14 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
              />
              <Kbd>esc</Kbd>
            </div>
            <Command.List className="min-h-0 flex-1 overflow-y-auto p-2">
              <Command.Empty className="flex flex-col items-center gap-2 py-10 text-sm text-ink-2">
                <TennisBall size={28} />
                Nothing by that name. Try “Fetch” to ask in plain words.
              </Command.Empty>

              {q.trim().length > 2 && (
                <Command.Group heading="Ask" className={group}>
                  <Command.Item value={`fetch ${q}`} onSelect={() => run(() => navigate(`/fetch?q=${encodeURIComponent(q)}`))} className={item}>
                    <TennisBall size={18} />
                    Go fetch “{q}”
                  </Command.Item>
                </Command.Group>
              )}

              {!!presets?.length && (
                <Command.Group heading="Run a preset" className={group}>
                  {presets.map((p) => (
                    <Command.Item key={p.id} value={`run preset ${p.name}`} onSelect={() => run(() => launch({ kind: 'preset', id: p.id }))} className={item}>
                      <span className="w-[18px] text-center text-base" aria-hidden>
                        {p.emoji}
                      </span>
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="tabular text-[13px] text-ink-3">{fmtShort(presetTotal(p))}</span>
                      <Play />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {!!packs?.length && (
                <Command.Group heading="Spin a pack" className={group}>
                  {packs.map((p) => (
                    <Command.Item key={p.id} value={`run pack ${p.name}`} onSelect={() => run(() => launch({ kind: 'pack', id: p.id }))} className={item}>
                      <span className="w-[18px] text-center text-base" aria-hidden>
                        {p.emoji}
                      </span>
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="text-[13px] text-ink-3">{p.members.length} presets</span>
                      <Play />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group heading="Go to" className={group}>
                {NAV.map((n) => (
                  <Command.Item key={n.to} value={`go ${n.label}`} onSelect={() => run(() => navigate(n.to))} className={item}>
                    {n.icon ? <n.icon /> : <TennisBall size={18} />}
                    <span className="flex-1">{n.label}</span>
                    <span className="flex gap-1">
                      <Kbd>g</Kbd>
                      <Kbd>{n.key}</Kbd>
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>

              <Command.Group heading="Make" className={group}>
                <Command.Item value="new preset" onSelect={() => run(() => navigate('/presets/new'))} className={item}>
                  <Plus /> New preset
                </Command.Item>
                <Command.Item value="new pack" onSelect={() => run(() => navigate('/packs/new'))} className={item}>
                  <Plus /> New pack
                </Command.Item>
                <Command.Item value="new automation schedule" onSelect={() => run(() => navigate('/automations/new'))} className={item}>
                  <CalendarPlus /> New automation
                </Command.Item>
                <Command.Item
                  value="toggle theme dark light"
                  onSelect={() => run(() => settings && patch.mutate({ appearance: { ...settings.appearance, theme: dark ? 'light' : 'dark' } }))}
                  className={item}
                >
                  {dark ? <Sun /> : <Moon />} Switch to {dark ? 'light' : 'dark'} mode
                </Command.Item>
              </Command.Group>
            </Command.List>
            <div className="flex items-center gap-4 border-t border-line bg-surface-2 px-4 py-2.5 text-xs text-ink-3">
              <span className="flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> move
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>↵</Kbd> select
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <Kbd>{modKey}</Kbd>
                <Kbd>K</Kbd> toggle
              </span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
