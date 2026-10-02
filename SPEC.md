# Woltron — Product & Technical Spec

> Your very good food-fetching dog. Woltron automates Wolt orders: save what you like,
> bundle it, schedule it, trigger it, or just *ask* for it in plain words.

## 1. Goals

| # | Goal |
|---|------|
| G1 | Order food from Wolt in **one tap** (manual), **on a schedule** (timed), or **from an external event** (triggered). |
| G2 | Save **Presets** — a named basket of specific items, from one *or several* restaurants. |
| G3 | Group presets into a **Pack** 🐕 (our name for a "superset") — e.g. *"Random Asian"* — that picks one preset per run using a rotation strategy. |
| G4 | **Fetch** — free-text food search powered by an LLM (OpenRouter) on top of live Wolt data: *"something spicy and vegetarian under ₪60"*. |
| G5 | A spectacular, playful UI with a dog mascot, usable from **desktop (Electron)**, **desktop web**, and **mobile web** (PWA). |
| G6 | Safe by default: **dry-run** mode until the user explicitly enables live ordering; spending guards. |

Non-goals: being a full Wolt replacement (payments setup, account creation, address book management happen in Wolt itself).

## 2. Vocabulary

| Term | Meaning |
|------|---------|
| **Venue** | A Wolt restaurant/store. |
| **Preset** | Saved basket: list of `PresetItem`s (venue + item + quantity + chosen options). May span multiple venues → produces one Wolt order per venue. |
| **Pack** | A "superset": a set of presets with a rotation **strategy** (`shuffle`, `round-robin`, `weighted`, `fresh` = avoid recent repeats). Running a pack = pick a preset, then run it. |
| **Automation** | A rule: *when* (schedule / once / webhook / venue-comes-online) → *what* (preset or pack) → *how* (auto-place or ask-first) + guards. |
| **Run / Order** | One execution. Has per-venue sub-orders, status, log, and mode (`dry-run` or `live`). |
| **Fetch** | The LLM search feature ("Go fetch!"). |

## 3. Architecture

```
            ┌────────────────────── apps/desktop (Electron) ─────────────────────┐
            │  main process: spawns server in-process, tray, notifications,     │
            │  global shortcut, deep links (woltron://run/preset/<id>)          │
            │  BrowserWindow → http://127.0.0.1:<port>                          │
            └───────────────────────────────┬───────────────────────────────────┘
 phone/tablet browser (PWA) ──LAN + token──►│
 desktop browser ───────────localhost──────►│
                                            ▼
 apps/server (Node, Hono)  ── REST /api/* + SSE /api/events + serves apps/web build
   ├─ store        JSON file DB (~/.woltron/db.json), atomic writes
   ├─ engine       preset → venue baskets → Wolt order (dry-run / live)
   ├─ packs        rotation strategies
   ├─ scheduler    croner-based cron + one-off
   ├─ triggers     webhook (secret URL), venue-online poller
   ├─ llm          OpenRouter: intent extraction → Wolt search → rerank
   └─ auth         localhost = trusted; LAN requires bearer token (QR pairing)
        │
        ▼
 packages/wolt   unofficial Wolt API client (implements `WoltClient` from shared)
 packages/shared domain types + API contract (single source of truth)
 apps/web        React 19 + Vite + Tailwind v4 + Radix + Motion; responsive + PWA
```

### Tech choices
- **TypeScript everywhere**, npm workspaces, Node ≥ 22.
- **Server:** Hono + `@hono/node-server`, `croner` for scheduling, plain `fetch`. JSON-file storage (no native deps → painless Electron packaging). Bundled with `tsup` to a single ESM file.
- **Web:** React 19, Vite, Tailwind CSS v4, Radix UI primitives (shadcn-style components), Motion (framer-motion) for animation, TanStack Query, React Router, lucide icons, `sonner` toasts, `cmdk` command palette.
- **Desktop:** Electron, loads the local server; tray menu lists presets/packs for one-click runs.
- **LLM:** OpenRouter Chat Completions with JSON output; key from `OPENROUTER_API_KEY` env (or set in Settings).

## 4. Wolt integration (unofficial)

Public, unauthenticated endpoints (verified live):
- `GET restaurant-api.wolt.com/v1/pages/restaurants?lat&lon` — venues delivering to a location.
- `POST restaurant-api.wolt.com/v1/pages/search` — text search (venues + items).
- Venue details / menu / assortment endpoints (exact versions determined by `packages/wolt` research; see `packages/wolt/README.md`).

Authenticated (user's Wolt session):
- Auth via **refresh token** pasted from wolt.com (localStorage/cookie `__wrtoken`) or via email magic-link flow if feasible. Access tokens refreshed automatically against `authentication.wolt.com`.
- Basket → checkout → purchase endpoints used for live orders, order status for tracking.
- If any live-ordering step can't be reproduced reliably, the engine falls back to **"handoff" mode**: it builds the basket in the user's Wolt account and opens the Wolt checkout URL so the user taps *Pay* once.

Every outbound call goes through one rate-limited client with retries, and the whole client can run in **mock mode** (`WOLTRON_WOLT_MOCK=1`) with fixture data for UI dev/tests.

## 5. Ordering engine

1. Resolve target → preset (packs pick via strategy; pick is recorded).
2. Group preset items by venue. For each venue: check online/delivering, re-validate item availability and price (menu refresh), build basket.
3. Guards: `maxTotal` per run, venue must be open (`onlyIfVenueOpen`), quiet days.
4. Confirmation policy: `auto` places immediately; `ask` sets status `awaiting-confirmation` and emits a notification (desktop notification / web push-ish toast); expires after `confirmWindowMin`.
5. Mode: `dry-run` → status `simulated` with full price breakdown; `live` → place order(s) via Wolt (or `handoff`).
6. Every step appends to the run log; SSE broadcasts `run.updated`.

## 6. Packs (supersets)

Strategies:
- `shuffle` — uniform random.
- `weighted` — random by per-preset weight (1–5 "bones").
- `round-robin` — deterministic cycle, cursor stored.
- `fresh` — random but excludes the last *N* picks (`avoidRepeats`).

Preview endpoint shows "next up" for deterministic strategies and odds for random ones.

## 7. Triggers / automations

| Trigger | Config | Notes |
|---|---|---|
| `schedule` | cron + timezone, UI builder ("Weekdays at 12:30") | `croner` |
| `once` | ISO datetime | auto-disables after firing |
| `webhook` | auto-generated secret | `POST /api/hooks/:id/:secret` — use from Shortcuts/IFTTT/Home Assistant/curl |
| `venue-online` | venue slug | polls every 2 min; fires when venue flips to open (once per day) |

Manual run is always available from: preset/pack cards, command palette (⌘K), Electron tray, deep links.

## 8. Fetch (LLM search)

1. LLM call #1: free text → `FetchIntent` `{ searchTerms[], cuisines[], dietary[], maxPrice?, mood, excluded[] }`.
2. For each search term: Wolt search near the user's location → candidate items (dedupe, ≤ 60).
3. LLM call #2: rerank candidates against the request → top N with one-line *why* ("Spicy, vegan, ₪48, 25 min").
4. UI shows result cards; one tap → add to a new/existing preset or order now.
Default model: `anthropic/claude-sonnet-4.5`-class via OpenRouter, configurable; graceful keyword-only fallback when no key.

## 9. UI / UX

Personality: warm, playful, confident — a good dog. Not a Wolt clone (Wolt is blue/clean; we're warm + characterful).

Screens:
- **Home ("Kennel")** — greeting by time of day with mascot; *Next up* automation countdown; quick-run tiles for favourite presets & packs; recent runs.
- **Fetch** — big conversational search box, mascot "sniffing" loading state, result cards.
- **Explore** — venues near you, venue page with menu, item option picker → "Add to preset".
- **Presets** — grid of cards (cover collage from item images), editor with multi-venue grouping, totals.
- **Packs** — cards with stacked preset covers, strategy picker, weights, "spin" preview animation.
- **Automations** — list with next-run times, natural-language schedule builder, webhook URL copy, enable toggles.
- **Runs** — timeline with live status, per-venue breakdown, logs, confirm/cancel.
- **Settings** — Wolt connection, delivery location (map-free: address search + geolocation), order mode (dry-run ⇄ live with scary confirm), spending limits, LLM model, devices (QR pairing for phone), theme.

Layout: desktop = left sidebar + content; mobile = bottom tab bar + sheets (drawer-style dialogs). Light & dark themes. Command palette ⌘K. Keyboard shortcuts. Reduced-motion respected. Mascot states: idle, happy, sniffing (loading), sleeping (empty), eating (order placed), sad (error).

## 10. Security & safety
- Default `dry-run`. Switching to `live` requires typed confirmation.
- Per-run and per-day spend caps.
- Server binds `127.0.0.1` unless LAN access enabled; LAN requests need bearer token (QR pairing, token rotatable).
- Wolt tokens and API keys stored in `~/.woltron/secrets.json` (0600), never sent to the web client.
- Webhook secrets are per-automation and rotatable.

## 11. Repo layout & scripts
```
packages/shared  packages/wolt  apps/server  apps/web  apps/desktop  assets/  docs/
npm run dev       # server (tsx watch) + web (vite) concurrently
npm run build     # all
npm run desktop   # electron dev
npm start         # production server serving web build
```
