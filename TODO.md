# Woltron — Central TODO

Single coordination board for all workstreams. **Agents working in worktrees: edit this file only
at its absolute path `/home/user/woltron/TODO.md` (main checkout) and only inside your own section**
— never commit it from a worktree. Mark `[x]` when done, `[~]` in progress, `[!]` blocked (add a note).

Contract (do not change without noting it here): `packages/shared/src/*` · Spec: `SPEC.md`

## 0. Foundation — *orchestrator*
- [x] Spec (`SPEC.md`)
- [x] Shared domain types + REST contract + `WoltClient` interface (`packages/shared`)
- [x] Monorepo skeleton (npm workspaces, tsconfig)
- [ ] Merge workstreams, `npm install`, end-to-end smoke test (mock + live catalog)
- [ ] Screenshots for README
- [ ] README with mascot, docs, CREDITS
- [ ] Private GitHub repo + push

## 1. Wolt client — `packages/wolt` — *agent: wolt*
- [x] Research unofficial endpoints (venues, venue, menu/assortment, search, geocode, auth refresh, basket, checkout, purchase, order status); document in `packages/wolt/README.md`
- [x] HTTP core: headers, retries, rate-limit, caching
- [x] Catalog: geocode, listVenues, getVenue, getMenu, search → mapped to shared types
- [x] Auth: refresh-token connect + auto refresh; magic link if feasible (verifyMagicLink works from a pasted link; requestMagicLink likely captcha-blocked → throws 'unsupported')
- [x] Ordering: quoteBasket (live Wolt checkout pricing, verified), placeOrder (headless purchase behind `experimentalPurchase`/WOLTRON_WOLT_EXPERIMENTAL_PURCHASE=1, else throws 'unsupported' → handoff), getOrderStatus (inferred)
- [x] Mock client with realistic fixtures (captured from live API, images included)
- [x] Live smoke script + unit tests for mappers
- [ ] Contract change request (not applied): add optional `lines?: BasketLineInput[]` (and `venueId?`) to `BasketQuote` so `placeOrder` can rebuild a persisted quote; `@woltron/wolt` already attaches these as extra fields (`WoltQuoteExtras`) — server should persist the whole quote object as-is.

## 2. Server — `apps/server` — *agent: server*
- [x] Hono app, static web serving, auth middleware (localhost trusted / bearer token), SSE hub
- [x] JSON store with atomic writes + secrets file (0600)
- [x] Settings + Wolt auth routes, pairing (LAN URLs + QR svg)
- [x] Catalog proxy routes w/ cache
- [x] Presets / Packs / Automations CRUD
- [x] Pack strategies (shuffle, weighted, round-robin, fresh) + preview
- [x] Run engine: validate → guards → confirm policy → dry-run / live / handoff, logs, SSE
- [x] Scheduler (croner): schedule + once; describe-cron; venue-online poller; webhooks
- [x] Fetch: OpenRouter intent → Wolt search → rerank; keyword fallback
- [x] Seed demo data on first run (mock mode)
- [x] Tests (packs, engine guards, store)
- [x] Note: branch `worktree-agent-a869e64901fc3fabf` (main merged in; uses the real `@woltron/wolt`, bundled into dist; the stand-in in `src/wolt/fallback-mock.ts` is only a last resort). Verified end to end against live Wolt (dry-run with exact checkout fees, live→handoff) and real OpenRouter. Default LLM `anthropic/claude-sonnet-4.5` (~8s fetch; haiku-4.5 ~4s).

## 3. Web UI — `apps/web` — *agent: web*
- [~] Design system: tokens (light/dark), typography, components (Button, Card, Sheet/Dialog, Tabs, Switch, Input, Badge, Toast, Skeleton, Command palette)
- [~] App shell: desktop sidebar / mobile bottom tabs, ⌘K, theme, SSE live updates, API client + token handling
- [~] Home (Kennel)
- [~] Fetch (LLM search)
- [~] Explore + Venue menu + item option picker → add to preset
- [~] Presets list + editor
- [~] Packs list + editor + spin preview
- [~] Automations list + editor (schedule builder, webhook copy)
- [~] Runs timeline + run detail (confirm/cancel)
- [~] Settings (Wolt connect, location, mode, limits, LLM, devices/QR, appearance)
- [~] PWA manifest + icons, responsive polish, reduced motion

## 4. Assets & Desktop — `assets/`, `apps/desktop` — *agent: desktop*
- [x] Mascot: cute dog, multiple states (idle, happy, sniffing, sleeping, eating, sad) — CC0 preferred; record licences in `CREDITS.md` — Fluent Emoji dog face (MIT) recomposed; `apps/web/public/mascot/*.{png,svg}` (commit ad4188c on branch worktree-agent-abcca4b06f5386bd6)
- [x] App icon set (png 16…1024, .ico, favicon.svg), PWA icons, README banner — also icns, tray icons, logo.svg, stickers; regenerate via `assets/scripts/build_assets.py`
- [x] Electron main: start server in-process, window, tray w/ presets & packs quick-run, notifications, global shortcut, deep links, single instance — commit 59e9cd8; verified on Linux against `apps/desktop/dev/stub-server.mjs`; web UI can use `window.woltronDesktop` (see apps/desktop/README.md)
- [x] electron-builder config (AppImage/deb/dmg/nsis) — `--dir` linux build verified; needs a self-contained (deps bundled) `apps/server/dist/index.js`
