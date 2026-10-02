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
- [ ] Research unofficial endpoints (venues, venue, menu/assortment, search, geocode, auth refresh, basket, checkout, purchase, order status); document in `packages/wolt/README.md`
- [ ] HTTP core: headers, retries, rate-limit, caching
- [ ] Catalog: geocode, listVenues, getVenue, getMenu, search → mapped to shared types
- [ ] Auth: refresh-token connect + auto refresh; magic link if feasible
- [ ] Ordering: quoteBasket, placeOrder (or handoff w/ checkoutUrl), getOrderStatus
- [ ] Mock client with realistic fixtures (captured from live API, images included)
- [ ] Live smoke script + unit tests for mappers

## 2. Server — `apps/server` — *agent: server*
- [ ] Hono app, static web serving, auth middleware (localhost trusted / bearer token), SSE hub
- [ ] JSON store with atomic writes + secrets file (0600)
- [ ] Settings + Wolt auth routes, pairing (LAN URLs + QR svg)
- [ ] Catalog proxy routes w/ cache
- [ ] Presets / Packs / Automations CRUD
- [ ] Pack strategies (shuffle, weighted, round-robin, fresh) + preview
- [ ] Run engine: validate → guards → confirm policy → dry-run / live / handoff, logs, SSE
- [ ] Scheduler (croner): schedule + once; describe-cron; venue-online poller; webhooks
- [ ] Fetch: OpenRouter intent → Wolt search → rerank; keyword fallback
- [ ] Seed demo data on first run (mock mode)
- [ ] Tests (packs, engine guards, store)

## 3. Web UI — `apps/web` — *agent: web*
- [ ] Design system: tokens (light/dark), typography, components (Button, Card, Sheet/Dialog, Tabs, Switch, Input, Badge, Toast, Skeleton, Command palette)
- [ ] App shell: desktop sidebar / mobile bottom tabs, ⌘K, theme, SSE live updates, API client + token handling
- [ ] Home (Kennel)
- [ ] Fetch (LLM search)
- [ ] Explore + Venue menu + item option picker → add to preset
- [ ] Presets list + editor
- [ ] Packs list + editor + spin preview
- [ ] Automations list + editor (schedule builder, webhook copy)
- [ ] Runs timeline + run detail (confirm/cancel)
- [ ] Settings (Wolt connect, location, mode, limits, LLM, devices/QR, appearance)
- [ ] PWA manifest + icons, responsive polish, reduced motion

## 4. Assets & Desktop — `assets/`, `apps/desktop` — *agent: desktop*
- [ ] Mascot: cute dog, multiple states (idle, happy, sniffing, sleeping, eating, sad) — CC0 preferred; record licences in `CREDITS.md`
- [ ] App icon set (png 16…1024, .ico, favicon.svg), PWA icons, README banner
- [ ] Electron main: start server in-process, window, tray w/ presets & packs quick-run, notifications, global shortcut, deep links, single instance
- [ ] electron-builder config (AppImage/deb/dmg/nsis)
