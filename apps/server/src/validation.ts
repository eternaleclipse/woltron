import { z } from 'zod';
import { badRequest } from './errors.js';

const money = z.object({ amount: z.number().int().nonnegative(), currency: z.string().min(3).max(3) });
const id = z.string().min(1).max(200);

export const geoSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  address: z.string().max(300).optional(),
  label: z.string().max(100).optional(),
});

const presetItem = z.object({
  key: z.string().min(1).max(100),
  venueId: id,
  venueSlug: id,
  venueName: z.string().max(200),
  itemId: id,
  name: z.string().max(300),
  image: z.string().max(2000).optional(),
  unitPrice: money,
  quantity: z.number().int().min(1).max(99),
  options: z.array(z.object({ groupId: id, valueIds: z.array(id) })).default([]),
  optionSummary: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
});

export const presetInput = z.object({
  name: z.string().trim().min(1, 'Give your preset a name').max(100),
  emoji: z.string().max(16).default('🍱'),
  color: z.string().max(40).default('amber'),
  description: z.string().max(1000).optional(),
  items: z.array(presetItem).max(100).default([]),
  tags: z.array(z.string().max(40)).max(30).default([]),
  deliveryNote: z.string().max(500).optional(),
  tip: money.optional(),
  favorite: z.boolean().default(false),
});

export const packInput = z.object({
  name: z.string().trim().min(1, 'Give your pack a name').max(100),
  emoji: z.string().max(16).default('🐕'),
  color: z.string().max(40).default('amber'),
  description: z.string().max(1000).optional(),
  members: z
    .array(z.object({ presetId: id, weight: z.number().int().min(1).max(5).default(3) }))
    .max(100)
    .default([]),
  strategy: z.enum(['shuffle', 'weighted', 'round-robin', 'fresh']).default('shuffle'),
  avoidRepeats: z.number().int().min(0).max(50).default(1),
  favorite: z.boolean().default(false),
});

const target = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('preset'), id }),
  z.object({ kind: z.literal('pack'), id }),
]);

const trigger = z.discriminatedUnion('type', [
  z.object({ type: z.literal('schedule'), cron: z.string().min(1).max(100), timezone: z.string().min(1).max(100), humanLabel: z.string().max(200).optional() }),
  z.object({ type: z.literal('once'), at: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date') }),
  // Secret is server-generated; clients may echo the existing one back.
  z.object({ type: z.literal('webhook'), secret: z.string().max(200).optional().default('') }),
  z.object({ type: z.literal('venue-online'), venueSlug: id, venueName: z.string().max(200).optional() }),
]);

export const automationInput = z.object({
  name: z.string().trim().min(1, 'Give your automation a name').max(100),
  enabled: z.boolean().default(true),
  target,
  trigger,
  confirm: z.enum(['auto', 'ask']).default('ask'),
  confirmWindowMin: z.number().int().min(1).max(24 * 60).default(15),
  guards: z
    .object({
      maxTotal: money.optional(),
      onlyIfAllVenuesOpen: z.boolean().default(false),
      skipDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366).optional(),
    })
    .default({ onlyIfAllVenuesOpen: false }),
});

export const runRequest = z.object({
  target,
  mode: z.enum(['dry-run', 'live', 'handoff']).optional(),
  source: z.enum(['manual', 'schedule', 'once', 'webhook', 'venue-online', 'fetch', 'tray', 'deeplink']).optional(),
  confirm: z.enum(['auto', 'ask']).optional(),
});

export const settingsPatch = z.object({
  location: geoSchema.nullable().optional(),
  savedLocations: z.array(geoSchema).max(50).optional(),
  orderMode: z.enum(['dry-run', 'live', 'handoff']).optional(),
  limits: z.object({ maxPerRun: money.nullable().optional(), maxPerDay: money.nullable().optional() }).optional(),
  llm: z.object({ model: z.string().min(1).max(200).optional(), apiKey: z.string().max(500).nullable().optional() }).optional(),
  lan: z.object({ enabled: z.boolean().optional(), port: z.number().int().min(1024).max(65535).optional() }).optional(),
  appearance: z
    .object({
      theme: z.enum(['system', 'light', 'dark']).optional(),
      reducedMotion: z.boolean().optional(),
      mascotName: z.string().trim().min(1).max(40).optional(),
    })
    .optional(),
  notifications: z.object({ desktop: z.boolean().optional(), sound: z.boolean().optional() }).optional(),
  language: z.string().min(2).max(10).optional(),
});

export const fetchRequest = z.object({ query: z.string().max(500), limit: z.number().int().min(1).max(20).optional() });
export const describeCronRequest = z.object({ cron: z.string().min(1).max(100), timezone: z.string().min(1).max(100) });

export function parse<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) {
    const msg = r.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
    throw badRequest(msg, 'validation');
  }
  return r.data;
}
