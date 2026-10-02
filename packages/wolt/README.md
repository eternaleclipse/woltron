# @woltron/wolt

An unofficial Wolt API client. It implements the `WoltClient` contract from `@woltron/shared`.

```ts
import { createWoltClient } from '@woltron/wolt';

const wolt = createWoltClient({ mock: false, language: 'en', logger: console.log });
const { venues } = await wolt.listVenues({ lat: 32.0853, lon: 34.7818 });
const menu = await wolt.getMenu(venues[0].slug);
const quote = await wolt.quoteBasket(menu.venue.slug, [{ itemId: menu.items[0].id, quantity: 1, options: [] }], loc);
```

* `mock` defaults to the `WOLTRON_WOLT_MOCK=1` environment variable. Mock mode serves the fixtures in `fixtures/`, which were captured from the live API.
* `experimentalPurchase` (or `WOLTRON_WOLT_EXPERIMENTAL_PURCHASE=1`) turns on the headless purchase attempt. When it is off, `placeOrder` throws `WoltError('unsupported')` and the server falls back to handoff.
* The client is consumed as TypeScript source (`main: ./src/index.ts`). Its only runtime dependency is global `fetch` (Node 22 or newer).

Scripts (run from the repo root):

| Command | What it does |
|---|---|
| `npm -w @woltron/wolt run test` | vitest: mappers (fixture based), mock client, live client with a fake fetch, HTTP core |
| `npm -w @woltron/wolt run typecheck` | `tsc` |
| `npx tsx packages/wolt/scripts/smoke.ts [query] [--mock] [--verbose]` | Live smoke: geocode, list, venue, menu, real quote, search, auth error path. Set `WOLT_REFRESH_TOKEN` to also test a real connect. |
| `npx tsx packages/wolt/scripts/capture-fixtures.ts` | Re-captures the mock fixtures and raw samples from the live API |

## Architecture

| File | Role |
|---|---|
| `src/http.ts` | `HttpCore`. Sends browser-like headers. Retries 429 always and 5xx/network errors for GETs (or when `retry: true`), with exponential backoff and jitter, honouring `Retry-After`. Allows 4 requests in flight per host. Keeps an in-memory TTL cache (single-flight, promise-based). Maps HTTP status to a `WoltError` code (401/403 → `unauthorized`, 404/410 → `not_found`, 429 → `rate_limited`, network failure → `network`). |
| `src/mappers.ts` | Pure functions from raw Wolt JSON to `Venue`, `Menu`, `MenuItem`, `MenuOptionGroup`, `SearchResult` and `GeoLocation`. Fully covered by fixture tests. |
| `src/ordering.ts` | Resolves a basket (prices, option validation, defaults) and builds the payloads for checkout, basket and purchase. |
| `src/auth.ts` | `TokenManager`. Single-flight refresh, rotation, listeners, magic-link exchange. |
| `src/live-client.ts` | `LiveWoltClient`. |
| `src/mock-client.ts` | `MockWoltClient`. Runs the same mappers over the fixtures. |

Cache TTLs: venue list 60 s, search 60 s, static venue 10 min, dynamic venue 30 s, assortment 5 min, geocoding 1 h, user 5 min.

## Endpoints

Legend:
* ✅ **verified live**: probed with curl/node on 2026-10-02 and exercised by `scripts/smoke.ts`.
* 🟡 **verified error path**: the endpoint exists and rejects bad input as expected, but the success path needs a real account.
* 🔶 **inferred**: reconstructed from the wolt.com web bundle (`wolt-com-static-assets.wolt.com/*.js`, client v1.16.144) and cross-checked against open-source clients. Never exercised with a real account.

Every request sends these headers, which mirror the web app's axios defaults: `platform: Web`, `app-language: <lang>`, `app-locale`, `client-version`/`clientversionnumber: 1.16.144`, `origin`/`referer: https://wolt.com`, and a desktop Chrome `user-agent`. Authenticated calls add `authorization: Bearer <access_token>`.

Hosts: `restaurant-api.wolt.com` (legacy pages, purchases, user), `consumer-api.wolt.com` (order-xp and assortment), `authentication.wolt.com`.

### Catalog (public, no auth)

| Purpose | Request | Status | Notes |
|---|---|---|---|
| Venues near a point | `GET restaurant-api /v1/pages/restaurants?lat&lon` | ✅ | Returns about 3 MB and roughly 1,400 Tel Aviv venues in `sections[name=restaurants-delivering-venues].items[].venue`. `venue.online`/`delivers` reflect "open now" and "delivers here", and closed venues come back as `online:false, delivers:false` with an `overlay: "Closed"`. Prices and estimates are in minor units. The list has **no delivery fee**. Top-level `city` is the URL city slug. Cuisine filters are in `filtering.filters[id=primary].values`. |
| Venue (static) | `GET consumer-api /order-xp/web/v1/pages/venue/slug/{slug}/static` | ✅ | Contains `venue` (name, images, rating, `share_url`, country, currency, `delivery_geo_range` polygon, `service_fee_estimate`) and `venue_raw` (location, food_tags, price_range, `tipping`, `allowed_payment_methods`, opening times). Unknown slug → 404. |
| Venue (dynamic, per location) | `GET consumer-api /order-xp/web/v1/venue/slug/{slug}/dynamic/?lat&lon` | ✅ | Contains `venue.online`, `delivery_open_status.is_open`, next open/close times and `delivery_configs[].estimate`. `venue_raw.delivery_specs.original_delivery_price` is the fee for this location. `delivery_pricing.price_ranges` is the service-fee and small-order formula: fee = `a + b·subtotal` for `min ≤ subtotal < max`, where `max` 0 means unbounded. `venue_raw.discounts[]` holds campaigns, for example a free-delivery campaign with `effects.delivery_discount.fraction=1`. |
| Menu | `GET consumer-api /consumer-api/consumer-assortment/v1/venues/slug/{slug}/assortment?language=en` | ✅ | `categories[{id,name,item_ids,subcategories}]` and `items[]` (price, images, `options[]` *bindings* `{id, option_id, name, multi_choice_config.total_range{min,max}, prerequisite_values}`, `disabled_info`, `dietary_preferences`, `restrictions`, `checksum`). `options[]` holds the shared *definitions* `{id, type: multi_choice|choice, default_value, values[{id,name,price}]}`. Non-native languages are auto-translated (`available_languages`). Large stores use `loading_strategy != "full"` and per-category loading at `/assortment/categories/slug/{slug}` 🔶. |
| Menu (legacy) | `GET restaurant-api /v4/venues/slug/{slug}/menu` | ✅ dead | Returns 200 with an empty body. `/v3/venues/slug/{slug}` returns 410 ("update the app"). Not used. |
| Search | `POST restaurant-api /v1/pages/search` with `{q, target, lat, lon}` | ✅ | With `target:null` you get 4 venues and 4 items (preview). `target:"venues"` gives up to 100 and `target:"items"` up to 200; the client calls both in parallel. Item hits have `menu_item` plus `link.menu_item_details` (`venue_slug`, `city_slug`, `venue_rating`). Item names stay in the venue's own language (often Hebrew). Zero-price hits are menu notices and get dropped. |
| Geocode | `GET restaurant-api /v1/google/geocode/json?address=…&language=` | ✅ | Google Geocoding API shape (proxied, no key needed). |
| Address autocomplete | `GET consumer-api /v2/google/places/autocomplete/json?input&language&types=geocode&radius` | ✅ | Returns `predictions[{address{main_text,secondary_text}, place_id}]`. |
| Place → coordinates | `GET consumer-api /v1/google/geocode-address?place_id=…` (or `latlng=`) | ✅ | Returns `result.coordinates{lat,lng}` and `formatted_address`. |
| Geocode fallback | `GET nominatim.openstreetmap.org/search?format=jsonv2` | ✅ | Used only if both Wolt proxies fail. Sends an identifying User-Agent. |

`geocode()` tries the Wolt geocoder first, then autocomplete plus place lookup (up to 5), then Nominatim.

### Auth

| Purpose | Request | Status | Notes |
|---|---|---|---|
| Refresh | `POST authentication /v1/wauth2/access_token`, form body `grant_type=refresh_token&refresh_token=…` | 🟡 | A bad token returns `401 {"error_code":126,"msg":"invalid credentials"}`. Success returns `{access_token, refresh_token, expires_in (~1800), token_type:"Bearer"}`. **The refresh token rotates on every exchange**, and `onTokensRefreshed` fires each time so the server can persist the new one. |
| Magic-link exchange | same endpoint, `grant_type=email_login&token=<token>&audience=wolt-com` | 🔶 (bad token returns 401) | `verifyMagicLink` accepts a pasted `https://wolt.com/...?...&token=…` link or a raw token. If Wolt answers with an access-confirmation (MFA/SMS) step, the client throws `unsupported`. |
| Send magic link | `POST authentication /v3/users/email_login {email, audience:"wolt-com"}` | 🔶 | wolt.com sends an `h-captcha-response` header with this request, so a headless call will probably be refused. `requestMagicLink` turns any 4xx into `WoltError('unsupported')` with advice to request the link on wolt.com and paste it. |
| Current user | `GET restaurant-api /v1/user/me` | 🟡 | Without a token: 401 `error_code 304`. The success shape (`user.name.first_name/last_name`, `email`, `phone_number`) is inferred and parsed defensively. |
| Logout | `POST authentication /v1/wauth2/logout {refresh_tokens:[…]}` | 🔶 | Not used. |

Getting a refresh token: log in on wolt.com, open DevTools → Application → Cookies (or Local Storage) → copy `__wrtoken`. The access token lives in `__wtoken`. The client strips quotes and whitespace. On any authenticated 401, the client force-refreshes once and retries. The access token is also refreshed proactively 60 s before it expires.

> Note: newer wolt.com sessions can use the DoorDash "Pedregal" provider. Those refresh through `unified-gateway.dashapi.com/identity/v1/oauth/token` with a client id, and the client does not support them. If a pasted `__wrtoken` fails with error 126, log out and back in on wolt.com.

### Ordering

| Purpose | Request | Status | Notes |
|---|---|---|---|
| Price a basket | `POST consumer-api /order-xp/web/v2/pages/checkout {purchase_plan}` | ✅ **works unauthenticated** | Returns `payable_amount`, `telemetry{delivery_price, service_fee, small_order_fee}`, `purchase_validation{end_amount, delivery_price, discounts, offers, surcharges}`, `delivery_configs[].estimate`, `purchasing_disabled`, `id` (the checkout id). Verified to apply free-delivery campaigns when their ids are passed in `use_promo_discount_ids`, the 5% service fee with ₪1.00/₪5.90 bounds, and the small-order surcharge. Wolt trusts the client-sent `end_amount`, so prices are always recomputed from the assortment first. |
| Fee estimate | `POST consumer-api /order-xp/web/v1/pages/venue/pricing-estimates {purchase_plan}` | ✅ | A lighter variant. Not used. |
| Save basket to account | `POST consumer-api /order-xp/v1/baskets {venue_id, currency, items[{id,count,name,price(line total),options[{id,values[{id,count,price}]}],substitution_settings}]}` | 🔶 | A per-venue upsert that returns `{id, venue_id}`. Called by `quoteBasket` when connected, so that the wolt.com checkout page shows the basket. Related endpoints: `GET /order-xp/v1/baskets/venue?venue_id=`, `GET /order-xp/web/v1/pages/baskets?lat&lon`, `POST /order-xp/v1/baskets/bulk/delete {ids}`, `GET /order-xp/v1/baskets/count`. |
| Saved addresses | `GET restaurant-api /v2/delivery/info` | 🔶 | `results[{id, location{coordinates, address, city}}]`. |
| Payment methods | `GET restaurant-api /v3/user/me/payment_methods` | 🔶 | The web app's richer variant is `POST payment-service.wolt.com /v1/payment-methods/checkout`, which needs the `platform` header. |
| Purchase | `POST restaurant-api /v2/purchases` | 🔶 | The payload mirrors the web bundle's builder: `client_nonce`, `signature_datetime{$date}`, `signature:"N/A"`, `type:"purchase"`, `currency`, `delivery_method`, `delivery_info{id{$oid}}`, `items[{id,count,name[{value,lang}],baseprice,end_amount,options[{id,type:Choice/Multichoice/Bool,name,values[{id,count,price,name}]}],checksum,…}]`, `payment_method_id/type`, `end_amount`, `delivery_price`, `discounts/offers/surcharges` (from checkout validation), `checkout_id`, `pricing_model_version:2023`, `menu_items_source:"consumer-assortment"`, `tip_amount`. The response is `results{id{$oid}, status, payment_plan?}`. A `payment_plan` means Adyen 3DS or another redirect is required, and the order is returned with status `payment_action_required` and its tracking URL. |
| Order status | `GET restaurant-api /v2/order_details/purchase_tracking/{id}` | 🔶 | `order_details.status` is one of received, acknowledged, production, ready, fetched, delivered, rejected, refunded. ETA comes from `delivery_eta.$date`. Alternative: `GET consumer-api /order-xp/v1/pages/order-tracking/{id}`. Cancel: `PUT restaurant-api /v2/purchases/{id}/cancel`. |
| Order history | `GET consumer-api /order-xp/web/v1/pages/orders` | 🔶 | Not used. |

#### How `quoteBasket` works

1. It fetches the static and dynamic venue pages and the assortment in parallel (all cached).
2. `resolveBasket` validates each line: whether the item exists and is available, which option values exist, and the min/max for each group. A missing required choice is auto-filled from the group's `default_value`. Unit price = item price + Σ(option value price × count), in minor units. Problems become `warnings` and do not throw. The client throws `item_unavailable` only when no line survives.
3. It calls the **live checkout endpoint**, using the session if there is one, with the venue's unconditional campaign ids. Delivery fee, service fee (including any small-order fee), total and ETA come from Wolt itself (`source: "checkout-api"`). If that call fails, the client falls back to its own estimate: the dynamic delivery fee minus campaigns, plus the `price_ranges` service fee (`source: "client-estimate"`), and adds a warning.
4. Warnings are added when the venue is closed, does not deliver, or the subtotal is below the order minimum.
5. Handoff:
   * **Connected**: the basket is upserted into the user's Wolt account (`basketId`), and `checkoutUrl = https://wolt.com/{lang}/{country}/{city}/restaurant/{slug}/checkout`. Wolt syncs server baskets to every logged-in client, so the user opens the link and taps Pay.
   * **Not connected**: `checkoutUrl` is the venue page, with a warning. There is no way to deep-link a prefilled cart for logged-out users, because the web app keeps that cart in localStorage. The SPA does support `?cart=open` on venue URLs.
6. The returned quote also carries non-contract extras (`lines`, `venueId`, `venueName`, `currency`, `quotedAt`, `source`) so that `placeOrder` can rebuild the order. These are exported as `WoltQuoteExtras`.

#### How `placeOrder` works, and its limits

* Without a session it throws `unauthorized`.
* Unless `experimentalPurchase` is on, it throws `unsupported`. **This is the default**, because the purchase flow has never been run against a real account and costs real money.
* When enabled, it:
  1. re-validates venue status, items and prices;
  2. picks the saved Wolt address within 300 m of `loc`, and throws `unsupported` if there is none;
  3. picks a saved **card** (Apple Pay, Google Pay and other wallets cannot be used headlessly);
  4. runs a fresh checkout with `delivery_info_id` and the payment method, and refuses with `unknown` if the total rose more than 2% over the quote;
  5. posts `/v2/purchases`.

  Risks: Wolt may require 3DS or another payment challenge (the order comes back as `payment_action_required` with a tracking URL), WAF or device fingerprinting (`ravelin_device_id`, `browser_info`) may reject a headless client, and the request shapes may drift.

### Mock mode

* `fixtures/venues.json` holds 25 Tel Aviv venues from the live list, trimmed to the fields the mappers use. Cuisines: sushi ×2, ramen ×2, thai ×2, chinese ×2, indian ×2, poke, vietnamese, pizza ×2, burger ×2, salad ×2, mexican, vegan, hummus, shawarma, italian, dessert, bakery. They keep real `imageproxy.wolt.com` / `wolt-menu-images-cdn.wolt.com` images. Two venues (shawarma and bakery) are deliberately closed. The others are marked open, because captures often run at night.
* `fixtures/venues/<slug>.json` holds the static, dynamic and assortment data for **12 full menus** (sushi, ramen, thai, chinese, indian, poke, vietnamese, pizza, burger, salad, mexican, vegan), up to 70 items each, with real option groups and prices. Venues without a full menu get a small "Popular" menu built from the list's real `venue_preview_items`.
* `fixtures/samples/` holds raw search, geocode and checkout responses that are used only by the mapper tests.
* `fixtures/index.ts` is generated, with static JSON imports so it bundles cleanly with tsup or esbuild.
* Behaviour:
  * `search` does keyword matching over venue names and tags and over every fixture menu item.
  * `geocode` knows a handful of Tel Aviv places and otherwise falls back to the city centre.
  * `quoteBasket` uses the same `resolveBasket` and fee formulas with simulated latency.
  * `connectWithRefreshToken` accepts any token except `invalid` and fires `onTokensRefreshed`.
  * `placeOrder` needs a connection and an open venue.
  * `getOrderStatus` advances received → acknowledged → production → ready → fetched → delivered every 15 s.

Note that some Wolt menu images point at `image-resizer-proxy.development.dev.woltapi.com`. That is what the production API returns, and the URLs do serve the images (HTTP 200).

## Prior art

Endpoint knowledge was cross-checked against [skorokithakis/woltapi](https://github.com/skorokithakis/woltapi) (Python, HAR-verified basket and checkout) and [Michaelliv/runline](https://github.com/Michaelliv/runline) (`packages/runline-plugins/wolt`). Both are AGPL, so **no code was copied**; only facts about the HTTP API were used. Everything else comes from live probing and the public wolt.com JS bundle.
