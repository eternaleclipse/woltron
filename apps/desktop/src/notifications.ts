import { Notification, nativeImage } from 'electron';
import { formatMoney, type Run, type ServerEvent, type Settings } from '@woltron/shared';
import { assetPath } from './paths';

type NotificationEvent = Extract<ServerEvent, { type: 'notification' }>;

export interface NotifierDeps {
  settings(): Settings | undefined;
  open(path?: string): void;
  confirmRun(runId: string): Promise<unknown>;
}

const DEDUPE_MS = 5000;

/**
 * Native notifications for SSE events.
 *  - `notification` events → toast; click opens /runs/<runId> when present.
 *  - runs entering `awaiting-confirmation` → toast with a "Confirm" action (macOS/Windows),
 *    merged with the server's own notification for the same run so users see one toast.
 */
export class Notifier {
  private runs = new Map<string, Run>();
  private shownAt = new Map<string, number>();
  private live = new Set<Notification>(); // keep references so click handlers survive GC
  private icon = nativeImage.createFromPath(assetPath('icon', 'png', '256x256.png'));

  constructor(private deps: NotifierDeps) {}

  private enabled() {
    return this.deps.settings()?.notifications?.desktop !== false && Notification.isSupported();
  }

  handle(ev: ServerEvent) {
    if (ev.type === 'run.updated') this.onRun(ev.run);
    else if (ev.type === 'notification') this.onNotification(ev);
  }

  private onRun(run: Run) {
    const prev = this.runs.get(run.id);
    this.runs.set(run.id, run);
    if (this.runs.size > 200) this.runs.delete(this.runs.keys().next().value!);
    if (run.status === 'awaiting-confirmation' && prev?.status !== 'awaiting-confirmation') {
      // Give the server's own `notification` event a moment to arrive, then show ours if it didn't.
      setTimeout(() => {
        if (this.recentlyShown(run.id)) return;
        const total = run.total?.amount ? ` (${formatMoney(run.total)})` : '';
        this.show({
          title: `Ready to order ${run.presetName}?`,
          body: `Woltie is waiting for your OK${total}.`,
          runId: run.id,
          confirm: true,
        });
      }, 1200);
    }
  }

  private onNotification(ev: NotificationEvent) {
    const run = ev.runId ? this.runs.get(ev.runId) : undefined;
    const confirm = run?.status === 'awaiting-confirmation';
    if (confirm && this.recentlyShown(run.id)) return;
    this.show({ title: ev.title, body: ev.body, runId: ev.runId, confirm });
  }

  private recentlyShown(runId: string) {
    const at = this.shownAt.get(runId);
    return at !== undefined && Date.now() - at < DEDUPE_MS;
  }

  private show(n: { title: string; body?: string; runId?: string; confirm?: boolean }) {
    if (!this.enabled()) return;
    if (n.runId) this.shownAt.set(n.runId, Date.now());
    const notification = new Notification({
      title: n.title,
      body: n.body ?? '',
      icon: process.platform === 'darwin' ? undefined : this.icon,
      silent: this.deps.settings()?.notifications?.sound === false,
      actions: n.confirm ? [{ type: 'button', text: 'Confirm' }] : [],
      closeButtonText: n.confirm ? 'Later' : undefined,
      urgency: n.confirm ? 'critical' : 'normal',
    });
    const runPath = n.runId ? `/runs/${n.runId}` : undefined;
    this.live.add(notification);
    const release = () => this.live.delete(notification);
    notification.on('click', () => {
      this.deps.open(runPath);
      release();
    });
    notification.on('action', () => {
      if (n.runId) {
        this.deps.confirmRun(n.runId).catch(() => this.deps.open(runPath));
      }
      release();
    });
    notification.on('close', release);
    notification.show();
  }
}
