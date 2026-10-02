import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron';
import type { Pack, Preset, Run, RunStatus, Settings, Target } from '@woltron/shared';
import type { ApiClient } from './api';
import { assetPath } from './paths';

export interface TrayActions {
  open(path?: string): void;
  run(target: Target, label: string): void;
  getLaunchAtLogin(): boolean;
  setLaunchAtLogin(on: boolean): void;
  quit(): void;
}

const STATUS_ICON: Record<RunStatus, string> = {
  pending: '⏳',
  'awaiting-confirmation': '🔔',
  placing: '🛵',
  placed: '✅',
  'handed-off': '👉',
  simulated: '🧪',
  delivered: '🍽️',
  skipped: '⏭️',
  failed: '⚠️',
  cancelled: '✖️',
  expired: '⌛',
};

const MAX_ITEMS = 25;

function byFavouriteThenRecent<T extends { favorite: boolean; name: string; lastRunAt?: string }>(a: T, b: T) {
  if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
  const la = a.lastRunAt ?? '';
  const lb = b.lastRunAt ?? '';
  if (la !== lb) return la < lb ? 1 : -1;
  return a.name.localeCompare(b.name);
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function trayImage() {
  if (process.platform === 'darwin') {
    const img = nativeImage.createFromPath(assetPath('tray', 'trayTemplate.png'));
    img.setTemplateImage(true);
    return img;
  }
  // Linux/Windows: nativeImage picks tray@2x.png automatically on HiDPI.
  return nativeImage.createFromPath(assetPath('tray', 'tray.png'));
}

export class WoltronTray {
  private tray: Tray;
  private presets: Preset[] = [];
  private packs: Pack[] = [];
  private runs: Run[] = [];
  private settings: Settings | undefined;
  private connected = false;
  private refreshing: Promise<void> | undefined;
  private timer: NodeJS.Timeout;

  constructor(
    private api: ApiClient,
    private actions: TrayActions,
  ) {
    this.tray = new Tray(trayImage());
    this.tray.setToolTip('Woltron — your very good food-fetching dog');
    if (process.platform !== 'darwin') this.tray.on('click', () => actions.open());
    this.render();
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), 60_000);
  }

  get currentSettings() {
    return this.settings;
  }

  setConnected(connected: boolean) {
    if (this.connected === connected) return;
    this.connected = connected;
    this.render();
  }

  /** Refetch presets, packs, recent runs and settings (coalesced). */
  refresh(): Promise<void> {
    this.refreshing ??= (async () => {
      const [presets, packs, runs, settings] = await Promise.allSettled([
        this.api.presets(),
        this.api.packs(),
        this.api.runs(8),
        this.api.settings(),
      ]);
      if (presets.status === 'fulfilled') this.presets = presets.value;
      if (packs.status === 'fulfilled') this.packs = packs.value;
      if (runs.status === 'fulfilled') this.runs = runs.value;
      if (settings.status === 'fulfilled') this.settings = settings.value;
      this.render();
    })().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  /** Apply a run update without a full refetch. */
  upsertRun(run: Run) {
    const i = this.runs.findIndex((r) => r.id === run.id);
    if (i >= 0) this.runs[i] = run;
    else this.runs.unshift(run);
    this.runs = this.runs.slice(0, 8);
    this.render();
  }

  setSettings(settings: Settings) {
    this.settings = settings;
    this.render();
  }

  private render() {
    if (this.tray.isDestroyed()) return;
    const a = this.actions;
    const presets = [...this.presets].sort(byFavouriteThenRecent).slice(0, MAX_ITEMS);
    const packs = [...this.packs].sort(byFavouriteThenRecent).slice(0, MAX_ITEMS);
    const label = (x: { emoji?: string; name: string; favorite: boolean }) =>
      `${x.emoji ? x.emoji + '  ' : ''}${x.name}${x.favorite ? '  ★' : ''}`;

    const empty = (text: string): MenuItemConstructorOptions[] => [{ label: text, enabled: false }];
    const withSeparatorAfterFavourites = (items: Array<{ favorite: boolean }>, menu: MenuItemConstructorOptions[]) => {
      const firstNonFav = items.findIndex((x) => !x.favorite);
      if (firstNonFav > 0) menu.splice(firstNonFav, 0, { type: 'separator' });
      return menu;
    };

    const presetMenu = presets.length
      ? withSeparatorAfterFavourites(
          presets,
          presets.map((p) => ({ label: label(p), click: () => a.run({ kind: 'preset', id: p.id }, p.name) })),
        )
      : empty(this.connected ? 'No presets yet' : 'Connecting…');
    const packMenu = packs.length
      ? withSeparatorAfterFavourites(
          packs,
          packs.map((p) => ({ label: label(p), click: () => a.run({ kind: 'pack', id: p.id }, p.name) })),
        )
      : empty(this.connected ? 'No packs yet' : 'Connecting…');
    const runMenu: MenuItemConstructorOptions[] = this.runs.length
      ? [
          ...this.runs.map((r) => ({
            label: `${STATUS_ICON[r.status] ?? '•'}  ${r.packName ? r.packName + ' → ' : ''}${r.presetName} · ${ago(r.createdAt)}`,
            click: () => a.open(`/runs/${r.id}`),
          })),
          { type: 'separator' },
          { label: 'All runs…', click: () => a.open('/runs') },
        ]
      : empty('No runs yet');

    const mode = this.settings?.orderMode;
    const template: MenuItemConstructorOptions[] = [
      { label: 'Open Woltron', click: () => a.open() },
      { type: 'separator' },
      { label: 'Run preset', submenu: presetMenu },
      { label: 'Run pack', submenu: packMenu },
      { label: 'Recent runs', submenu: runMenu },
      { type: 'separator' },
      {
        label: 'Dry-run mode',
        type: 'checkbox',
        enabled: !!mode,
        checked: mode === 'dry-run' || !mode,
        click: () => {
          if (mode === 'dry-run') {
            // Going live needs the typed confirmation in Settings — never flip it from here.
            a.open('/settings#order-mode');
            this.render(); // revert the checkbox
          } else {
            void this.api
              .patchSettings({ orderMode: 'dry-run' })
              .then((s) => this.setSettings(s))
              .catch(() => this.render());
          }
        },
      },
      {
        label: 'Launch at login',
        type: 'checkbox',
        checked: a.getLaunchAtLogin(),
        click: (item) => a.setLaunchAtLogin(item.checked),
      },
      { type: 'separator' },
      { label: 'Quit Woltron', accelerator: 'CommandOrControl+Q', click: () => a.quit() },
    ];
    this.tray.setContextMenu(Menu.buildFromTemplate(template));
    if (process.env.WOLTRON_DEBUG) {
      const dump = (items: MenuItemConstructorOptions[], d = 0): string =>
        items.map((i) => `${'  '.repeat(d)}${i.type === 'separator' ? '---' : `${i.type === 'checkbox' ? (i.checked ? '[x] ' : '[ ] ') : ''}${i.label}`}\n${Array.isArray(i.submenu) ? dump(i.submenu, d + 1) : ''}`).join('');
      console.log('[woltron] tray menu\n' + dump(template));
    }
    if (process.platform !== 'linux') {
      this.tray.setToolTip(
        `Woltron${mode && mode !== 'dry-run' ? ` — ${mode.toUpperCase()} mode` : ' — dry-run'}`,
      );
    }
  }

  destroy() {
    clearInterval(this.timer);
    this.tray.destroy();
  }
}
