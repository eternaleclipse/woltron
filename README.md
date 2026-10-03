<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-dark.svg">
    <img src="assets/brand/logo.svg" alt="Woltron" width="440">
  </picture>
</p>

<h3 align="center">Your very good food-fetching dog.</h3>

<p align="center">
  Automate your Wolt orders: save exactly what you love, bundle it, schedule it, trigger it,<br>
  or just tell the dog what you're craving.
</p>

<p align="center">
  <img alt="Platforms" src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows%20%7C%20Web%20%7C%20Mobile-2b1a33?style=flat-square">
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A522-5fa04e?style=flat-square&logo=nodedotjs&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Tests" src="https://img.shields.io/badge/tests-vitest-6e9f18?style=flat-square&logo=vitest&logoColor=white">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/github/license/eternaleclipse/woltron?style=flat-square&color=cadb72&labelColor=2b1a33"></a>
  <img alt="Safe by default" src="https://img.shields.io/badge/safe%20by%20default-dry--run-cadb72?style=flat-square&labelColor=2b1a33">
</p>
<p align="center">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=black">
  <img alt="Tailwind CSS v4" src="https://img.shields.io/badge/Tailwind-v4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646cff?style=flat-square&logo=vite&logoColor=white">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-47848f?style=flat-square&logo=electron&logoColor=white">
  <img alt="Hono" src="https://img.shields.io/badge/Hono-e36002?style=flat-square&logo=hono&logoColor=white">
  <img alt="OpenRouter" src="https://img.shields.io/badge/AI-OpenRouter-6d28d9?style=flat-square">
</p>

<p align="center">
  <a href="docs/getting-started.md"><b>Get started</b></a> ·
  <a href="docs/README.md"><b>Documentation</b></a> ·
  <a href="#-features">Features</a> ·
  <a href="#-screenshots">Screenshots</a> ·
  <a href="docs/api.md">API</a> ·
  <a href="docs/architecture.md">Architecture</a>
</p>

<p align="center">
  <img src="docs/screenshots/home-desktop.png" alt="Woltron home screen" width="92%">
</p>

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 🍱 Presets
Save an exact basket: dishes, options, quantities. It can span **several restaurants**, and each venue becomes
its own Wolt order. Prices and availability are re-checked on every run.
<br>→ [Presets & Packs](docs/presets-and-packs.md)

</td>
<td width="50%" valign="top">

### 🎲 Packs
Bundle presets into a rotation like **"Random Asian"**. Each run the dog picks one: **shuffle**,
**weighted** (1–5 🦴), **round-robin**, or **fresh** (no repeats).
<br>→ [Presets & Packs](docs/presets-and-packs.md#packs-let-the-dog-pick)

</td>
</tr>
<tr>
<td valign="top">

### ⏰ Automations
**Schedules** ("weekdays at 12:30"), **one-offs**, **webhooks** (Shortcuts, Home Assistant, curl) and
**"when it opens"**. Auto-place or **ask first**, with spending guards.
<br>→ [Automations](docs/automations.md)

</td>
<td valign="top">

### 🔎 Fetch
*"something spicy & vegan under ₪60"*. An LLM (via OpenRouter) understands the request, searches live Wolt
menus near you and explains each pick.
<br>→ [Fetch](docs/fetch.md)

</td>
</tr>
<tr>
<td valign="top">

### 🖥️ Desktop, web & phone
Electron app with a tray for one-click runs, notifications and a global shortcut. The same UI runs in your
browser and installs on your phone over a QR code.
<br>→ [Desktop](docs/desktop.md) · [Phone](docs/devices.md)

</td>
<td valign="top">

### 🛡️ Safe by default
Starts in **dry run**: a full quote with Wolt's real fees, nothing bought. Going live takes a typed
confirmation; per-run and per-day spending caps.
<br>→ [Ordering & safety](docs/ordering-and-safety.md)

</td>
</tr>
</table>

## 🐕 Meet Woltie

<p align="center">
  <img src="apps/web/public/mascot/idle.png" width="110" alt="idle">
  <img src="apps/web/public/mascot/happy.png" width="110" alt="happy">
  <img src="apps/web/public/mascot/sniffing.png" width="110" alt="sniffing">
  <img src="apps/web/public/mascot/eating.png" width="110" alt="eating">
  <img src="apps/web/public/mascot/sleeping.png" width="110" alt="sleeping">
  <img src="apps/web/public/mascot/sad.png" width="110" alt="sad">
  <br><sub>idle · happy · sniffing · eating · sleeping · sad. In the app, the LED visor is animated: it blinks, scans while searching and dims to standby.</sub>
</p>

## 📸 Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/fetch-desktop.png" alt="Fetch"><br><sub><b>Fetch</b>: plain-language search over live menus</sub></td>
    <td width="50%"><img src="docs/screenshots/pack-editor-desktop.png" alt="Pack editor"><br><sub><b>Packs</b>: strategy, weights, odds and a spin preview</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/automation-editor-desktop.png" alt="Automation editor"><br><sub><b>Automations</b>: schedules, webhooks, guards</sub></td>
    <td><img src="docs/screenshots/run-detail-desktop.png" alt="Run detail"><br><sub><b>Runs</b>: per-venue breakdown and a live log</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/preset-editor-desktop.png" alt="Preset editor"><br><sub><b>Presets</b>: multi-restaurant baskets</sub></td>
    <td><img src="docs/screenshots/home-desktop-dark.png" alt="Dark mode"><br><sub><b>Dark mode</b></sub></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/home-mobile.png" width="23%" alt="Mobile home">
  <img src="docs/screenshots/fetch-mobile.png" width="23%" alt="Mobile fetch">
  <img src="docs/screenshots/item-sheet-mobile.png" width="23%" alt="Mobile item sheet">
  <img src="docs/screenshots/run-detail-mobile.png" width="23%" alt="Mobile run detail">
  <br><sub>On your phone</sub>
</p>

## 🚀 Quick start

```bash
git clone https://github.com/eternaleclipse/woltron.git && cd woltron
npm install

npm run dev:mock     # demo data, no Wolt account → http://localhost:5173
npm run dev          # live Wolt catalog
npm run desktop      # Electron app
```

Then set your **delivery address** and [connect your Wolt account](docs/connecting-wolt.md) in Settings.
For AI search, set `OPENROUTER_API_KEY` or paste a key in Settings. The full walkthrough is in
**[Getting started](docs/getting-started.md)**.

<details>
<summary><b>Production server & desktop installers</b></summary>

```bash
npm run build && npm start                # everything on http://localhost:4321
npm -w @woltron/desktop run dist          # AppImage / .deb / .dmg / Windows installer
scripts/install-linux.sh                  # per-user Linux install, no root needed
```

</details>

## 📚 Documentation

| Using Woltron | Building on Woltron |
|---|---|
| [Getting started](docs/getting-started.md) | [REST API](docs/api.md) |
| [Connecting your Wolt account](docs/connecting-wolt.md) | [Architecture](docs/architecture.md) |
| [Presets & Packs](docs/presets-and-packs.md) | [Development](docs/development.md) |
| [Automations](docs/automations.md) | [Wolt API notes](packages/wolt/README.md) |
| [Fetch (AI search)](docs/fetch.md) | [Desktop internals](apps/desktop/README.md) |
| [Ordering & safety](docs/ordering-and-safety.md) | [Design system](apps/web/DESIGN.md) |
| [Desktop app](docs/desktop.md) · [Phone](docs/devices.md) | [Product spec](SPEC.md) |
| [Configuration](docs/configuration.md) · [Troubleshooting](docs/troubleshooting.md) | [Project board](TODO.md) |

## 🧾 How a run works

```
preset or pack ─► pick a preset ─► group by restaurant ─► validate (open? available? current price?)
   ─► guards (limits, venues open, skip dates) ─► confirm (auto | ask) ─► order
         dry run → quote with Wolt's real fees · live → basket in your Wolt account → one-tap checkout
```

## 🏗️ Built with

**TypeScript** monorepo: [`packages/shared`](packages/shared/src) (contract) · [`packages/wolt`](packages/wolt)
(unofficial Wolt client) · [`apps/server`](apps/server/src) (Hono, SSE, croner) · [`apps/web`](apps/web)
(React 19, Vite, Tailwind v4, Radix, Motion, TanStack Query) · [`apps/desktop`](apps/desktop) (Electron).
See [Architecture](docs/architecture.md).

## ⚠️ Disclaimer

Woltron uses **unofficial** Wolt endpoints that can change without notice, and automated ordering may be
against Wolt's terms of service. Use it responsibly and at your own risk. Not affiliated with Wolt or DoorDash.

## 📄 License

[MIT](LICENSE) © eternaleclipse. Third-party assets keep their own licences; see [CREDITS.md](CREDITS.md).

## 💛 Credits

Woltie is an original robot dog drawn in code ([`assets/scripts/robodog.py`](assets/scripts/robodog.py)).
Banner food stickers are Microsoft's [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (MIT); the wordmark is set in
Fredoka (OFL). Full list in [CREDITS.md](CREDITS.md).
