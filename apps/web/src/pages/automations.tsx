import { Link, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { MoreHorizontal, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import type { Automation } from '@woltron/shared';
import { useAutomations, useDeleteAutomation, useFireAutomation, usePacks, usePresets, useToggleAutomation } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { cn, fmtDateTime, relTime } from '@/lib/utils';
import { Countdown, EmptyState, ErrorState, PageHeader, TriggerIcon, TRIGGER_LABEL } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { Card, Skeleton, Switch } from '@/components/ui/primitives';
import { Menu } from '@/components/ui/controls';

export function triggerSummary(a: Automation): string {
  const t = a.trigger;
  switch (t.type) {
    case 'schedule':
      return t.humanLabel ?? t.cron;
    case 'once':
      return fmtDateTime(t.at);
    case 'webhook':
      return 'When the webhook URL is called';
    case 'venue-online':
      return `When ${t.venueName ?? t.venueSlug} opens`;
  }
}

export function AutomationsPage() {
  const { data, isLoading, isError, error, refetch } = useAutomations();
  const sorted = [...(data ?? [])].sort((a, b) => Number(b.enabled) - Number(a.enabled) || (a.nextFireAt ?? 'z').localeCompare(b.nextFireAt ?? 'z'));
  return (
    <div>
      <PageHeader
        title="Automations"
        subtitle="Lunch on a schedule, dinner when a button gets pressed, gelato the minute they open."
        actions={
          <Button variant="ball" size="lg" asChild>
            <Link to="/automations/new">
              <Plus /> New automation
            </Link>
          </Button>
        }
      />
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} retry={() => refetch()} />
      ) : sorted.length === 0 ? (
        <EmptyState
          mascot="sleeping"
          title="Nothing on autopilot"
          action={
            <Button variant="ball" asChild>
              <Link to="/automations/new">Schedule a fetch</Link>
            </Button>
          }
        >
          Set it once, and I’ll fetch on a timer, from a webhook, or when your favourite place opens.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {sorted.map((a, i) => (
            <motion.li key={a.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <AutomationRow a={a} />
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AutomationRow({ a }: { a: Automation }) {
  const { data: presets } = usePresets();
  const { data: packs } = usePacks();
  const toggle = useToggleAutomation();
  const fire = useFireAutomation();
  const del = useDeleteAutomation();
  const navigate = useNavigate();
  const target = a.target.kind === 'preset' ? presets?.find((p) => p.id === a.target.id) : packs?.find((p) => p.id === a.target.id);
  const upcoming = a.enabled && a.nextFireAt && new Date(a.nextFireAt).getTime() > Date.now();

  return (
    <Card className={cn('flex items-center gap-4 p-4 transition-opacity sm:p-5', !a.enabled && 'opacity-60')}>
      <TriggerIcon trigger={a.trigger.type} className="hidden sm:grid" />
      <Link to={`/automations/${a.id}`} className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <TriggerIcon trigger={a.trigger.type} className="size-8 rounded-[10px] sm:hidden [&_svg]:size-4" />
          <h3 className="truncate font-display text-lg font-bold leading-tight">{a.name}</h3>
        </div>
        <p className="mt-1 line-clamp-2 text-[13px] sm:truncate text-ink-2">
          <span className="font-semibold text-ink">{triggerSummary(a)}</span>
          {' → '}
          {target ? `${target.emoji} ${target.name}` : 'missing target'}
          {a.confirm === 'ask' ? ', asks first' : ', fully automatic'}
        </p>
        <p className="mt-0.5 text-xs text-ink-3">
          {TRIGGER_LABEL[a.trigger.type]}
          {a.lastFiredAt ? `, last fired ${relTime(a.lastFiredAt)}` : ', never fired'}
        </p>
      </Link>
      {upcoming && (
        <div className="hidden text-right md:block">
          <div className="text-xs text-ink-3">Next in</div>
          <Countdown to={a.nextFireAt!} className="font-display text-xl font-bold" />
        </div>
      )}
      <Switch
        checked={a.enabled}
        onCheckedChange={() =>
          toggle.mutate(a, {
            onSuccess: (n) => toast(n.enabled ? `${a.name} is on` : `${a.name} is paused`),
            onError: (e) => toast.error('Couldn’t update', { description: errorMessage(e) }),
          })
        }
        label={`${a.enabled ? 'Disable' : 'Enable'} ${a.name}`}
      />
      <Menu
        trigger={
          <button className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="More actions">
            <MoreHorizontal className="size-5" />
          </button>
        }
        items={[
          {
            label: 'Fire now',
            icon: <Play />,
            onSelect: () =>
              fire.mutate(a.id, {
                onSuccess: (run) => {
                  toast.success('Fired!', { description: `${run.presetName} is on its way through the run flow.` });
                  navigate(`/runs/${run.id}`);
                },
                onError: (e) => toast.error('Couldn’t fire', { description: errorMessage(e) }),
              }),
          },
          { label: 'Edit', icon: <Pencil />, onSelect: () => navigate(`/automations/${a.id}`) },
          'sep',
          { label: 'Delete', icon: <Trash2 />, danger: true, onSelect: () => del.mutate(a.id, { onSuccess: () => toast(`Deleted ${a.name}`) }) },
        ]}
      />
    </Card>
  );
}
