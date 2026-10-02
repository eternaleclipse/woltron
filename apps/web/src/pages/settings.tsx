import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { Check, Copy, ExternalLink, KeyRound, Laptop, LocateFixed, LogOut, MapPin, Monitor, Moon, RefreshCw, Search, Smartphone, Sun, TriangleAlert } from 'lucide-react';
import type { GeoLocation, Money, OrderMode, Settings, SettingsPatch } from '@woltron/shared';
import { useConnectWolt, useDisconnectWolt, useGeocode, useHealth, usePairing, usePatchSettings, useRotatePairing, useSettings } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { desktop } from '@/lib/desktop';
import { cn, currencySymbol, fmtDateTime } from '@/lib/utils';
import { ErrorState, MODE_META, PageHeader } from '@/components/bits';
import { Mascot } from '@/components/mascot';
import { Button } from '@/components/ui/button';
import { Badge, Card, Field, Input, Skeleton, SwitchRow, Textarea } from '@/components/ui/primitives';
import { Segmented } from '@/components/ui/controls';
import { Sheet } from '@/components/ui/sheet';

const SECTIONS = [
  { id: 'wolt', label: 'Wolt account' },
  { id: 'location', label: 'Delivery address' },
  { id: 'order-mode', label: 'Order mode' },
  { id: 'limits', label: 'Spending limits' },
  { id: 'llm', label: 'Fetch brain' },
  { id: 'devices', label: 'Phone & devices' },
  { id: 'appearance', label: 'Look & feel' },
  { id: 'notifications', label: 'Notifications' },
];

export function SettingsPage() {
  const { data: settings, isLoading, isError, error, refetch } = useSettings();
  const loc = useLocation();
  const patch = usePatchSettings();

  useEffect(() => {
    if (!settings || !loc.hash) return;
    const id = loc.hash.slice(1) === 'mode' ? 'order-mode' : loc.hash.slice(1);
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    return () => clearTimeout(t);
  }, [settings, loc.hash]);

  const update = (p: SettingsPatch, msg?: string) =>
    patch.mutate(p, {
      onSuccess: () => msg && toast.success(msg),
      onError: (e) => toast.error('Couldn’t save', { description: errorMessage(e) }),
    });

  if (isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-60" />
        <Skeleton className="h-60" />
        <Skeleton className="h-60" />
      </div>
    );
  if (isError || !settings) return <ErrorState error={error} retry={() => refetch()} />;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Account, address, money and manners." />
      <div className="grid items-start gap-8 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Settings sections" className="sticky top-8 hidden lg:block">
          <ul className="space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-sm px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink">
                  {s.label}
                </a>
              </li>
            ))}
            {desktop() && (
              <li>
                <a href="#desktop" className="block rounded-sm px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink">
                  Desktop app
                </a>
              </li>
            )}
          </ul>
        </nav>
        <div className="min-w-0 space-y-5">
          <WoltSection settings={settings} />
          <LocationSection settings={settings} update={update} />
          <ModeSection settings={settings} update={update} />
          <LimitsSection settings={settings} update={update} />
          <LlmSection settings={settings} update={update} />
          <DevicesSection settings={settings} update={update} />
          <AppearanceSection settings={settings} update={update} />
          <NotificationsSection settings={settings} update={update} />
          {desktop() && <DesktopSection />}
          <AboutFooter />
        </div>
      </div>
    </div>
  );
}

type Upd = (p: SettingsPatch, msg?: string) => void;

function Section({ id, title, description, children, aside }: { id: string; title: string; description?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-24 p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold">{title}</h2>
          {description && <p className="mt-1 text-[15px] text-ink-2">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </Card>
  );
}

// ───────── Wolt ─────────
function WoltSection({ settings }: { settings: Settings }) {
  const w = settings.wolt;
  const connect = useConnectWolt();
  const disconnect = useDisconnectWolt();
  const [token, setToken] = useState('');
  return (
    <Section
      id="wolt"
      title="Wolt account"
      description="Woltron orders through your own Wolt account. Your token stays on this computer."
      aside={w.connected ? <Badge tone="mint" size="lg"><Check /> Connected</Badge> : <Badge tone="biscuit" size="lg">Not connected</Badge>}
    >
      {w.connected ? (
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-surface-2 p-4">
          <span className="grid size-12 place-items-center rounded-full bg-ball font-display text-xl font-bold text-ball-ink">{w.user?.name?.[0] ?? 'W'}</span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{w.user?.name ?? 'Wolt user'}</div>
            <div className="truncate text-[13px] text-ink-2">{w.user?.email ?? w.user?.phone}</div>
            {w.expiresAt && <div className="text-xs text-ink-3">Session good until {fmtDateTime(w.expiresAt)}</div>}
          </div>
          <Button variant="outline" onClick={() => disconnect.mutate(undefined, { onSuccess: () => toast('Disconnected from Wolt') })} loading={disconnect.isPending}>
            <LogOut /> Disconnect
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <ol className="space-y-3 text-[15px]">
            {[
              <>
                Open <a href="https://wolt.com" target="_blank" rel="noreferrer" className="font-semibold underline decoration-ball-deep/60 decoration-2 underline-offset-4">wolt.com <ExternalLink className="inline size-3.5" /></a> and log in.
              </>,
              <>Open DevTools: <kbd className="font-semibold">F12</kbd> or <kbd className="font-semibold">⌥⌘I</kbd>.</>,
              <>Go to <strong>Application</strong>, then <strong>Local Storage</strong> (or <strong>Cookies</strong>) for wolt.com.</>,
              <>Find <code className="rounded bg-surface-3 px-1.5 py-0.5 text-[13px]">__wrtoken</code> and copy its whole value.</>,
              <>Paste it here. That’s it.</>,
            ].map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-collar text-xs font-bold text-collar-ink">{i + 1}</span>
                <span className="text-ink-2">{s}</span>
              </li>
            ))}
          </ol>
          <div className="space-y-3">
            {w.lastError && <p className="rounded-sm bg-danger-soft px-3 py-2 text-[13px] text-danger-ink">{w.lastError}</p>}
            <Field label="Refresh token" htmlFor="wolt-token" hint="Starts with something like eyJ…">
              <Textarea id="wolt-token" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste __wrtoken here" className="font-mono text-[13px]" spellCheck={false} />
            </Field>
            <Button
              variant="ball"
              className="w-full"
              disabled={!token.trim()}
              loading={connect.isPending}
              onClick={() =>
                connect.mutate(token.trim(), {
                  onSuccess: (c) => {
                    setToken('');
                    toast.success(c.connected ? `Hi ${c.user?.name?.split(' ')[0] ?? 'there'}! Wolt is connected` : 'Saved');
                  },
                  onError: (e) => toast.error('That token didn’t work', { description: errorMessage(e) }),
                })
              }
            >
              <KeyRound /> Connect Wolt
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ───────── Location ─────────
function LocationSection({ settings, update }: { settings: Settings; update: Upd }) {
  const [q, setQ] = useState('');
  const { data: results, isFetching } = useGeocode(q);
  const [locating, setLocating] = useState(false);
  const choose = (l: GeoLocation) => {
    update({ location: l }, 'Delivery address updated');
    setQ('');
  };
  const useMine = () => {
    if (!navigator.geolocation) return toast.error('This browser can’t share location');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        choose({ lat: p.coords.latitude, lon: p.coords.longitude, address: 'My current location', label: 'Here' });
      },
      (e) => {
        setLocating(false);
        toast.error('Couldn’t get your location', { description: e.message });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  return (
    <Section id="location" title="Delivery address" description="Where should I bring the food? Explore and Fetch search around this spot.">
      {settings.location && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-ball-soft p-4">
          <MapPin className="size-5 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold">{settings.location.label ?? 'Current address'}</div>
            <div className="truncate text-[13px] text-ink-2">{settings.location.address ?? `${settings.location.lat.toFixed(4)}, ${settings.location.lon.toFixed(4)}`}</div>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for an address" className="pl-10" aria-label="Search address" />
        </div>
        <Button variant="soft" onClick={useMine} loading={locating}>
          <LocateFixed /> Use my location
        </Button>
      </div>
      <AnimatePresence>
        {q.length >= 3 && (
          <motion.ul initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 overflow-hidden rounded-md border border-line">
            {isFetching && !results && <li className="p-3 text-sm text-ink-3">Sniffing the map…</li>}
            {results?.map((r, i) => (
              <li key={i}>
                <button onClick={() => choose(r)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-surface-2">
                  <MapPin className="size-4 text-ink-3" />
                  {r.address}
                </button>
              </li>
            ))}
            {results?.length === 0 && <li className="p-3 text-sm text-ink-3">No matches. Try a street and city.</li>}
          </motion.ul>
        )}
      </AnimatePresence>
      {settings.savedLocations.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {settings.savedLocations.map((l, i) => {
            const on = settings.location?.lat === l.lat && settings.location?.lon === l.lon;
            return (
              <button
                key={i}
                onClick={() => choose(l)}
                className={cn('rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors', on ? 'border-transparent bg-collar text-collar-ink' : 'border-line-strong text-ink-2 hover:text-ink')}
              >
                {l.label ?? l.address}
              </button>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ───────── Order mode ─────────
const PHRASE = 'I understand Woltron will spend real money';

function ModeSection({ settings, update }: { settings: Settings; update: Upd }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const pick = (m: OrderMode) => {
    if (m === settings.orderMode) return;
    if (m === 'live') {
      setTyped('');
      setConfirmOpen(true);
      return;
    }
    update({ orderMode: m }, m === 'dry-run' ? 'Back to dry runs. Nothing will be charged.' : 'Handoff mode on');
  };
  const order: OrderMode[] = ['dry-run', 'handoff', 'live'];
  return (
    <Section id="order-mode" title="Order mode" description="Start with dry runs. Go live when you trust me.">
      <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Order mode">
        {order.map((m) => {
          const meta = MODE_META[m];
          const on = settings.orderMode === m;
          return (
            <button
              key={m}
              role="radio"
              aria-checked={on}
              onClick={() => pick(m)}
              className={cn(
                'relative flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-[border-color,background-color,transform] duration-200 ease-[var(--ease-spring)] active:scale-[0.98]',
                on ? (m === 'live' ? 'border-tongue bg-tongue-soft' : 'border-ink bg-ball-soft') : 'border-line hover:border-line-strong',
              )}
            >
              <span className={cn('grid size-10 place-items-center rounded-[12px] [&_svg]:size-5', m === 'live' ? 'bg-tongue text-white' : m === 'handoff' ? 'bg-biscuit-soft text-biscuit-ink' : 'bg-plum-soft text-plum-ink')}>{meta.icon}</span>
              <span className="font-display text-lg font-bold">{meta.label}</span>
              <span className="text-[13px] text-ink-2">{meta.explain}</span>
              {on && (
                <span className="absolute right-3 top-3 grid size-6 place-items-center rounded-full bg-ink text-bg">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Sheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        size="sm"
        title="Turn on live orders?"
        hero={
          <div className="grid place-items-center bg-tongue-soft pb-2 pt-6">
            <Mascot state="sad" size={96} />
          </div>
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Keep dry runs
            </Button>
            <Button
              variant="tongue"
              disabled={typed.trim().toLowerCase() !== PHRASE.toLowerCase()}
              onClick={() => {
                update({ orderMode: 'live' }, 'Live orders are on. Spending limits still apply.');
                setConfirmOpen(false);
              }}
            >
              Go live
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-3 rounded-md bg-danger-soft p-3 text-[13px] text-danger-ink">
            <TriangleAlert className="size-5 shrink-0" />
            <p>
              From now on, presets, packs and automations place <strong>real Wolt orders</strong> and charge your saved payment method. Automations set to “Just do it” won’t ask.
            </p>
          </div>
          <Field label={<>Type “{PHRASE}” to continue</>} htmlFor="live-phrase">
            <Input id="live-phrase" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={PHRASE} autoComplete="off" spellCheck={false} />
          </Field>
        </div>
      </Sheet>
    </Section>
  );
}

// ───────── Limits ─────────
function MoneyInput({ id, value, currency, onCommit }: { id: string; value?: Money; currency: string; onCommit: (m?: Money) => void }) {
  const [v, setV] = useState(value ? String(value.amount / 100) : '');
  useEffect(() => setV(value ? String(value.amount / 100) : ''), [value]);
  const commit = () => {
    const next = v.trim() ? { amount: Math.round(Number(v) * 100), currency } : undefined;
    if ((next?.amount ?? null) !== (value?.amount ?? null)) onCommit(next);
  };
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">{currencySymbol(currency)}</span>
      <Input id={id} type="number" min={0} inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} placeholder="No limit" className="tabular pl-8" />
    </div>
  );
}

function LimitsSection({ settings, update }: { settings: Settings; update: Upd }) {
  const c = settings.limits.maxPerRun?.currency ?? settings.limits.maxPerDay?.currency ?? 'ILS';
  return (
    <Section id="limits" title="Spending limits" description="Hard stops for every run, even scheduled ones. If a run would cross a limit, I sit and stay.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Max per run" htmlFor="lim-run">
          <MoneyInput id="lim-run" value={settings.limits.maxPerRun} currency={c} onCommit={(m) => update({ limits: { ...settings.limits, maxPerRun: (m ?? null) as Money | undefined } }, m ? 'Limit saved' : 'Limit removed')} />
        </Field>
        <Field label="Max per day" htmlFor="lim-day">
          <MoneyInput id="lim-day" value={settings.limits.maxPerDay} currency={c} onCommit={(m) => update({ limits: { ...settings.limits, maxPerDay: (m ?? null) as Money | undefined } }, m ? 'Limit saved' : 'Limit removed')} />
        </Field>
      </div>
    </Section>
  );
}

// ───────── LLM ─────────
const MODELS = ['anthropic/claude-sonnet-4.5', 'anthropic/claude-haiku-4.5', 'openai/gpt-4.1-mini', 'google/gemini-2.5-flash'];

function LlmSection({ settings, update }: { settings: Settings; update: Upd }) {
  const [model, setModel] = useState(settings.llm.model);
  const [key, setKey] = useState('');
  useEffect(() => setModel(settings.llm.model), [settings.llm.model]);
  return (
    <Section
      id="llm"
      title="Fetch brain"
      description="Fetch uses an OpenRouter model to understand what you’re craving. Without a key, it falls back to plain keyword search."
      aside={
        <Badge tone={settings.llm.hasApiKey ? 'mint' : 'neutral'} size="lg">
          {settings.llm.keySource === 'env' ? 'Key from environment' : settings.llm.keySource === 'stored' ? 'Key saved' : 'No key'}
        </Badge>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Model" htmlFor="llm-model" hint="Any OpenRouter model id">
          <Input id="llm-model" list="llm-models" value={model} onChange={(e) => setModel(e.target.value)} onBlur={() => model !== settings.llm.model && update({ llm: { model } }, 'Model saved')} className="font-mono text-[13px]" />
          <datalist id="llm-models">
            {MODELS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <Field label="OpenRouter API key" htmlFor="llm-key" hint={settings.llm.keySource === 'env' ? 'Set via OPENROUTER_API_KEY. A saved key overrides it.' : 'Stored on this computer only.'}>
          <div className="flex gap-2">
            <Input id="llm-key" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={settings.llm.hasApiKey ? '••••••••••••' : 'sk-or-…'} autoComplete="off" />
            <Button
              variant="soft"
              disabled={!key.trim()}
              onClick={() => {
                update({ llm: { apiKey: key.trim() } }, 'Key saved');
                setKey('');
              }}
            >
              Save
            </Button>
          </div>
          {settings.llm.keySource === 'stored' && (
            <button className="mt-1 self-start text-xs font-semibold text-danger-ink hover:underline" onClick={() => update({ llm: { apiKey: null } }, 'Key removed')}>
              Remove saved key
            </button>
          )}
        </Field>
      </div>
    </Section>
  );
}

// ───────── Devices ─────────
function DevicesSection({ settings, update }: { settings: Settings; update: Upd }) {
  const { data: pairing, isLoading } = usePairing(settings.lan.enabled);
  const rotate = useRotatePairing();
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success('Link copied'));
  return (
    <Section id="devices" title="Phone & devices" description="Open Woltron on your phone over Wi-Fi. Scan the code and add it to your home screen.">
      <SwitchRow
        title="Allow devices on my network"
        description="Other devices need the secret link below. Off means only this computer can reach Woltron."
        checked={settings.lan.enabled}
        onCheckedChange={(v) => update({ lan: { ...settings.lan, enabled: v } }, v ? 'Phones can pair now' : 'Network access off')}
      />
      <AnimatePresence initial={false}>
        {settings.lan.enabled && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="grid size-44 shrink-0 place-items-center self-center rounded-lg bg-white p-3 shadow-md ring-1 ring-line">
                {isLoading ? (
                  <Skeleton className="size-full" />
                ) : pairing?.qrSvg ? (
                  <div className="size-full [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: pairing.qrSvg }} aria-label="QR code to open Woltron on your phone" role="img" />
                ) : (
                  <Smartphone className="size-10 text-ink-3" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {pairing?.urls.map((u) => (
                  <div key={u} className="flex items-center gap-2">
                    <Input readOnly value={u} className="h-10 font-mono text-xs" onFocus={(e) => e.target.select()} />
                    <Button variant="soft" size="icon" onClick={() => copy(u)} aria-label="Copy link">
                      <Copy />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" loading={rotate.isPending} onClick={() => rotate.mutate(undefined, { onSuccess: () => toast.success('New pairing code', { description: 'Previously paired devices need to scan again.' }) })}>
                  <RefreshCw /> Rotate pairing code
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Section>
  );
}

// ───────── Appearance ─────────
function AppearanceSection({ settings, update }: { settings: Settings; update: Upd }) {
  const a = settings.appearance;
  const [name, setName] = useState(a.mascotName);
  useEffect(() => setName(a.mascotName), [a.mascotName]);
  return (
    <Section id="appearance" title="Look & feel">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold">Theme</div>
            <div className="text-[13px] text-ink-2">Dark mode is extra cozy at night.</div>
          </div>
          <Segmented
            label="Theme"
            value={a.theme}
            onChange={(theme) => update({ appearance: { ...a, theme } })}
            options={[
              { value: 'system', label: 'Auto', icon: <Monitor /> },
              { value: 'light', label: 'Light', icon: <Sun /> },
              { value: 'dark', label: 'Dark', icon: <Moon /> },
            ]}
          />
        </div>
        <SwitchRow title="Reduce motion" description="Calmer screens: no bouncing, spinning or tail wags." checked={a.reducedMotion} onCheckedChange={(v) => update({ appearance: { ...a, reducedMotion: v } })} />
        <div className="flex items-end gap-4">
          <Mascot state="happy" size={64} />
          <Field label="Your dog’s name" htmlFor="mascot-name" className="flex-1">
            <Input id="mascot-name" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== a.mascotName && update({ appearance: { ...a, mascotName: name.trim() } }, `Good dog, ${name.trim()}!`)} />
          </Field>
        </div>
      </div>
    </Section>
  );
}

// ───────── Notifications ─────────
function NotificationsSection({ settings, update }: { settings: Settings; update: Upd }) {
  const n = settings.notifications;
  return (
    <Section id="notifications" title="Notifications">
      <div className="space-y-4">
        <SwitchRow
          title="Desktop notifications"
          description="When a run needs your OK, finishes, or fails."
          checked={n.desktop}
          onCheckedChange={async (v) => {
            if (v && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
            update({ notifications: { ...n, desktop: v } });
          }}
        />
        <SwitchRow title="Sound" description="A little bark when something happens." checked={n.sound} onCheckedChange={(v) => update({ notifications: { ...n, sound: v } })} />
      </div>
    </Section>
  );
}

// ───────── Desktop (Electron only) ─────────
function DesktopSection() {
  const bridge = desktop()!;
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    bridge.getLaunchAtLogin().then(setOn).catch(() => setOn(false));
  }, [bridge]);
  return (
    <Section id="desktop" title="Desktop app" aside={<Laptop className="size-6 text-ink-3" />}>
      <SwitchRow
        title="Launch at login"
        description="Start Woltron quietly in the tray so schedules keep running."
        checked={!!on}
        disabled={on === null}
        onCheckedChange={async (v) => {
          try {
            setOn(await bridge.setLaunchAtLogin(v));
          } catch (e) {
            toast.error('Couldn’t change that', { description: errorMessage(e) });
          }
        }}
      />
    </Section>
  );
}

function AboutFooter() {
  const { data } = useHealth();
  return (
    <p className="px-1 pt-2 text-center text-xs text-ink-3">
      Woltron {data?.version ?? ''}
      {data?.mockWolt ? ', using demo Wolt data' : ''}. Not affiliated with Wolt.
    </p>
  );
}
