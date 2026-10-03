# Getting started

Woltron runs as a small local server (port `4321`) that serves the web UI and talks to Wolt. You can use it
from the **desktop app**, your **browser**, or your **phone**. All three are the same app.

## Requirements

- Node.js **22+** and npm
- Linux, macOS or Windows
- Optional: an [OpenRouter](https://openrouter.ai) API key for [Fetch](fetch.md) (AI search)

## Install

```bash
git clone https://github.com/eternaleclipse/woltron.git
cd woltron
npm install
```

## Try it with demo data (no Wolt account)

```bash
npm run dev:mock
```

Open **http://localhost:5173**. Mock mode uses 25 real Tel Aviv restaurants captured from Wolt (real menus
and photos), seeds a few presets, packs and automations, and never talks to Wolt's servers.

## Use the real Wolt catalog

```bash
npm run dev            # dev servers (hot reload)
# or
npm run build && npm start   # production: everything served from http://localhost:4321
```

Then:

1. **Settings → Delivery address**: search your address (or use your current location).
2. **Settings → Wolt account**: connect your account ([how](connecting-wolt.md)). Browsing and dry runs work without it.
3. **Explore** or **Fetch**: find dishes and add them to a [preset](presets-and-packs.md).
4. Press ▶ on the preset. In **dry-run** mode (the default) you get a full price quote with Wolt's real fees
   and nothing is ordered.

## Desktop app

```bash
npm run desktop                    # run Electron against a fresh build
npm -w @woltron/desktop run dist   # build installers (AppImage/deb, dmg, nsis)
scripts/install-linux.sh           # Linux: per-user install, no root
```

See [Desktop app](desktop.md) for the tray, shortcuts and deep links.

## Next steps

- [Presets & Packs](presets-and-packs.md): save baskets, bundle them into rotations
- [Automations](automations.md): schedules, webhooks and "when it opens" triggers
- [Ordering & safety](ordering-and-safety.md): dry-run, live mode, spending limits
