/**
 * Basket resolution + payload builders for Wolt's ordering endpoints.
 *
 * Sources (see README "Ordering"): wolt.com web bundle (module building `purchase_plan`
 * for `order-xp/web/v2/pages/checkout`, cart → `order-xp/v1/baskets`, and the
 * `/v2/purchases` payload builder) cross-checked with open-source clients.
 * The checkout endpoint is VERIFIED live (works unauthenticated). Basket and purchase
 * payloads are INFERRED from the bundle and have not been exercised with a real account.
 */
import type { BasketLineInput, GeoLocation } from '@woltron/shared';
import type { Raw } from './mappers.js';

export interface ResolvedLine {
  input: BasketLineInput;
  item: Raw;
  categoryId?: string;
  unitPrice: number;
  endAmount: number;
  /** Selected values per item option binding id. */
  selected: Map<string, Array<{ id: string; count: number; price: number; name: string }>>;
}

export interface ResolvedBasket {
  lines: ResolvedLine[];
  subtotal: number;
  warnings: string[];
}

const arr = <T = Raw>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Validate and price basket lines against the assortment (client-side, minor units). */
export function resolveBasket(assortment: Raw, lines: BasketLineInput[]): ResolvedBasket {
  const items = new Map<string, Raw>();
  for (const it of arr(assortment?.items)) if (it?.id) items.set(it.id, it);
  const defs = new Map<string, Raw>();
  for (const o of arr(assortment?.options)) if (o?.id) defs.set(o.id, o);
  const catOf = new Map<string, string>();
  const walk = (cats: Raw[]) => {
    for (const c of cats) {
      for (const id of arr<string>(c?.item_ids)) if (!catOf.has(id)) catOf.set(id, c.id);
      walk(arr(c?.subcategories));
    }
  };
  walk(arr(assortment?.categories));

  const warnings: string[] = [];
  const resolved: ResolvedLine[] = [];
  for (const line of lines) {
    const it = items.get(line.itemId);
    if (!it) {
      warnings.push(`Item ${line.itemId} is no longer on the menu — skipped.`);
      continue;
    }
    if (it.disabled_info) {
      warnings.push(`"${it.name}" is currently unavailable — skipped.`);
      continue;
    }
    const qty = Math.max(1, Math.floor(line.quantity || 1));
    const selected: ResolvedLine['selected'] = new Map();
    let optionsTotal = 0;
    for (const binding of arr(it.options)) {
      const def = defs.get(binding.option_id);
      const chosen = line.options.find((o) => o.groupId === binding.id || o.groupId === binding.option_id);
      const counts = new Map<string, number>();
      for (const vid of chosen?.valueIds ?? []) counts.set(vid, (counts.get(vid) ?? 0) + 1);
      const values: Array<{ id: string; count: number; price: number; name: string }> = [];
      for (const [vid, count] of counts) {
        const dv = arr(def?.values).find((v: Raw) => v?.id === vid);
        if (!dv) {
          warnings.push(`Option value ${vid} is no longer offered for "${it.name}" — ignored.`);
          continue;
        }
        const price = Number(dv.price) || 0;
        values.push({ id: vid, count, price, name: dv.name ?? '' });
        optionsTotal += price * count;
      }
      const range = binding.multi_choice_config?.total_range ?? {};
      const conditional = arr(binding.prerequisite_values).length > 0;
      const total = values.reduce((s, v) => s + v.count, 0);
      if (!conditional && total < (Number(range.min) || 0)) {
        const def0 = typeof def?.default_value === 'string' ? arr(def?.values).find((v: Raw) => v?.id === def.default_value) : undefined;
        if (def0) {
          values.push({ id: def0.id, count: 1, price: Number(def0.price) || 0, name: def0.name ?? '' });
          optionsTotal += Number(def0.price) || 0;
          warnings.push(`"${it.name}": required choice "${binding.name}" was missing — used default "${def0.name}".`);
        } else {
          warnings.push(`"${it.name}": required choice "${binding.name}" is missing.`);
        }
      }
      if (Number(range.max) > 0 && total > Number(range.max)) warnings.push(`"${it.name}": too many choices for "${binding.name}" (max ${range.max}).`);
      if (values.length) selected.set(binding.id, values);
    }
    const unitPrice = (Number(it.price) || 0) + optionsTotal;
    resolved.push({ input: { ...line, quantity: qty }, item: it, categoryId: catOf.get(it.id), unitPrice, endAmount: unitPrice * qty, selected });
  }
  return { lines: resolved, subtotal: resolved.reduce((s, l) => s + l.endAmount, 0), warnings };
}

/** Options in the cart/checkout shape: every binding, unselected ones with `values: []`. */
function cartOptions(line: ResolvedLine) {
  return arr(line.item.options).map((b: Raw) => ({
    id: b.id,
    values: (line.selected.get(b.id) ?? []).map((v) => ({ id: v.id, count: v.count, price: v.price })),
  }));
}

/** `purchase_plan.menu_items[]` for checkout / pricing-estimates. VERIFIED (accepted live). */
export function checkoutMenuItems(basket: ResolvedBasket, venueId: string) {
  return basket.lines.map((l) => ({
    id: l.item.id,
    count: l.input.quantity,
    base_price: Number(l.item.price) || 0,
    end_amount: l.endAmount,
    options: cartOptions(l),
    category_id: l.categoryId ?? null,
    category_ids: l.categoryId ? [l.categoryId] : [],
    exclude_from_credits: false,
    exclude_from_discounts: false,
    exclude_from_discounts_min_basket: false,
    alcohol_permille: Number(l.item.alcohol_permille) || 0,
    restrictions: arr(l.item.restrictions).map((r: Raw) => ({ age_limit: r?.age_limit ?? r?.ageLimit ?? null, type: r?.type })),
    venue_id: venueId,
    is_weighted_item: false,
    age_limit: null,
  }));
}

export interface PurchasePlanInput {
  venue: { id: string; country: string; currency: string };
  loc: GeoLocation;
  tip?: number;
  discountIds?: string[];
  deliveryInfoId?: string;
  paymentMethods?: Array<{ id: string; type: string }>;
}

/** Body for `POST consumer-api /order-xp/web/v2/pages/checkout` (and pricing-estimates). */
export function purchasePlan(basket: ResolvedBasket, p: PurchasePlanInput) {
  return {
    purchase_plan: {
      venue: p.venue,
      delivery_method: 'homedelivery',
      menu_items: checkoutMenuItems(basket, p.venue.id),
      use_promo_discount_ids: p.discountIds ?? [],
      courier_tip: p.tip ?? 0,
      use_cash: false,
      use_credits_and_tokens: false,
      use_loyalty_points_amount: 0,
      use_promo_surcharge_ids: [],
      payment_methods: p.paymentMethods ?? [],
      is_priority_delivery: false,
      delivery: {
        delivery_coordinates: { latitude: p.loc.lat, longitude: p.loc.lon },
        ...(p.deliveryInfoId ? { delivery_info_id: p.deliveryInfoId } : {}),
      },
    },
  };
}

/** Body for `POST consumer-api /order-xp/v1/baskets` (server-side basket upsert, auth required). INFERRED. */
export function basketPayload(basket: ResolvedBasket, venue: { id: string; currency: string }) {
  return {
    venue_id: venue.id,
    currency: venue.currency,
    items: basket.lines.map((l) => ({
      id: l.item.id,
      count: l.input.quantity,
      name: l.item.name ?? '',
      price: l.endAmount,
      options: cartOptions(l),
      substitution_settings: { is_allowed: false },
    })),
  };
}

const OPTION_TYPE: Record<string, string> = { multi_choice: 'Multichoice', multichoice: 'Multichoice', choice: 'Choice', single_choice: 'Choice', bool: 'Bool', boolean: 'Bool' };

/** `items[]` for `POST restaurant-api /v2/purchases`. INFERRED from the web bundle. */
export function purchaseItems(basket: ResolvedBasket, assortment: Raw, language: string) {
  const defs = new Map<string, Raw>();
  for (const o of arr(assortment?.options)) if (o?.id) defs.set(o.id, o);
  return basket.lines.map((l) => {
    const it = l.item;
    return {
      id: it.id,
      count: l.input.quantity,
      name: [{ value: it.name ?? '', lang: language }],
      exclude_from_credits: false,
      from_recommendation: false,
      alcohol_percentage: Number(it.alcohol_permille) || 0,
      product_hierarchy_tags: it.product_hierarchy_tags ?? [],
      vat_category_code: it.vat_category_code ?? null,
      vat_percentage: it.vat_percentage ?? null,
      vat_percentage_decimal: it.vat_percentage_decimal ?? null,
      restrictions: arr(it.restrictions).map((r: Raw) => ({ age_limit: r?.age_limit ?? null, type: r?.type })),
      baseprice: Number(it.price) || 0,
      end_amount: l.endAmount,
      checksum: it.checksum,
      substitution_settings: { is_allowed: false },
      options: arr(it.options)
        .filter((b: Raw) => l.selected.has(b.id))
        .map((b: Raw) => {
          const def = defs.get(b.option_id);
          return {
            id: b.id,
            type: OPTION_TYPE[String(def?.type ?? '').toLowerCase()] ?? 'Multichoice',
            name: [{ value: b.name ?? def?.name ?? '', lang: language }],
            values: l.selected.get(b.id)!.map((v) => ({ id: v.id, count: v.count, price: v.price, name: [{ value: v.name, lang: language }] })),
          };
        }),
    };
  });
}

export interface CheckoutSummary {
  checkoutId?: string;
  payable: number;
  endAmount?: number;
  deliveryFee?: number;
  serviceFee?: number;
  etaMinutes?: number;
  disabledReason?: string;
  validation: Raw;
}

/** Parse the checkout page response. VERIFIED shape (live, unauthenticated). */
export function parseCheckout(res: Raw): CheckoutSummary {
  const tel = res?.telemetry ?? {};
  const val = res?.purchase_validation ?? {};
  const cfgs = arr(res?.delivery_configs);
  const home = cfgs.find((c: Raw) => c?.method === 'homedelivery' && c?.schedule === 'standard') ?? cfgs.find((c: Raw) => c?.method === 'homedelivery');
  const est = home?.estimate;
  const service = typeof tel.service_fee === 'number' ? tel.service_fee + (Number(tel.small_order_fee) || 0) : undefined;
  const disabled = res?.purchasing_disabled;
  return {
    checkoutId: typeof res?.id === 'string' ? res.id : (res?.id?.$oid ?? undefined),
    payable: Number(res?.payable_amount ?? val.end_amount) || 0,
    endAmount: typeof val.end_amount === 'number' ? val.end_amount : undefined,
    deliveryFee: typeof tel.delivery_price === 'number' ? tel.delivery_price : undefined,
    serviceFee: service,
    etaMinutes: typeof est?.mean === 'number' ? est.mean : typeof est?.max === 'number' ? est.max : undefined,
    disabledReason: disabled ? (typeof disabled === 'string' ? disabled : (disabled.title ?? disabled.text ?? disabled.reason ?? 'Purchasing disabled')) : undefined,
    validation: val,
  };
}
