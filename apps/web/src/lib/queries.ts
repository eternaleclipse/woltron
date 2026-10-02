import { keepPreviousData, QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Automation, AutomationInput, Pack, PackInput, Preset, PresetInput, Run, RunRequest, Settings, SettingsPatch,
} from '@woltron/shared';
import { api, ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

export const qk = {
  health: ['health'] as const,
  settings: ['settings'] as const,
  woltAuth: ['wolt-auth'] as const,
  pairing: ['pairing'] as const,
  venues: (tag?: string, lat?: number, lon?: number) => ['venues', tag ?? '', lat ?? 0, lon ?? 0] as const,
  venue: (slug: string) => ['venue', slug] as const,
  menu: (slug: string) => ['menu', slug] as const,
  search: (q: string) => ['search', q] as const,
  geocode: (q: string) => ['geocode', q] as const,
  presets: ['presets'] as const,
  preset: (id: string) => ['presets', id] as const,
  packs: ['packs'] as const,
  pack: (id: string) => ['packs', id] as const,
  packPreview: (id: string) => ['packs', id, 'preview'] as const,
  automations: ['automations'] as const,
  automation: (id: string) => ['automations', id] as const,
  cron: (cron: string, tz: string) => ['cron', cron, tz] as const,
  runs: ['runs'] as const,
  run: (id: string) => ['run', id] as const,
};

// ───────────── health / settings ─────────────
export const useHealth = () =>
  useQuery({ queryKey: qk.health, queryFn: () => api('GET /api/health'), refetchInterval: 30_000, retry: 0 });

export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: () => api('GET /api/settings') });

export function usePatchSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SettingsPatch) => api('PATCH /api/settings', { body }),
    onSuccess: (s: Settings) => {
      qc.setQueryData(qk.settings, s);
      qc.invalidateQueries({ queryKey: ['venues'] });
    },
  });
}

export const useWoltAuth = () => useQuery({ queryKey: qk.woltAuth, queryFn: () => api('GET /api/wolt/auth') });

export function useConnectWolt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (refreshToken: string) => api('POST /api/wolt/auth/token', { body: { refreshToken } }),
    onSuccess: (c) => {
      qc.setQueryData(qk.woltAuth, c);
      qc.invalidateQueries({ queryKey: qk.settings });
    },
  });
}

/** Connect with either a pasted login-email link (preferred: Woltron gets its own session) or a raw refresh token. */
export function useLinkWolt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: string) => {
      const v = input.trim();
      return /^<?["']?https?:\/\//i.test(v)
        ? api('POST /api/wolt/auth/verify', { body: { linkOrCode: v } })
        : api('POST /api/wolt/auth/token', { body: { refreshToken: v } });
    },
    onSuccess: (c) => {
      qc.setQueryData(qk.woltAuth, c);
      qc.invalidateQueries({ queryKey: qk.settings });
    },
  });
}

export function useDisconnectWolt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('DELETE /api/wolt/auth'),
    onSuccess: (c) => {
      qc.setQueryData(qk.woltAuth, c);
      qc.invalidateQueries({ queryKey: qk.settings });
    },
  });
}

export const usePairing = (enabled = true) => useQuery({ queryKey: qk.pairing, queryFn: () => api('GET /api/pairing'), enabled });

export function useRotatePairing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('POST /api/pairing/rotate'),
    onSuccess: (p) => qc.setQueryData(qk.pairing, p),
  });
}

// ───────────── catalog ─────────────
export const useGeocode = (q: string) =>
  useQuery({
    queryKey: qk.geocode(q),
    queryFn: ({ signal }) => api('GET /api/wolt/geocode', { query: { q }, signal }),
    enabled: q.trim().length >= 3,
    staleTime: 5 * 60_000,
  });

export const useVenues = (tag?: string, loc?: { lat: number; lon: number }) =>
  useQuery({
    queryKey: qk.venues(tag, loc?.lat, loc?.lon),
    queryFn: ({ signal }) => api('GET /api/wolt/venues', { query: { tag, lat: loc?.lat, lon: loc?.lon }, signal }),
    staleTime: 2 * 60_000,
    placeholderData: keepPreviousData,
  });

export const useVenue = (slug: string | undefined) =>
  useQuery({ queryKey: qk.venue(slug ?? ''), queryFn: () => api('GET /api/wolt/venues/:slug', { params: { slug: slug! } }), enabled: !!slug });

export const useMenu = (slug: string | undefined) =>
  useQuery({
    queryKey: qk.menu(slug ?? ''),
    queryFn: () => api('GET /api/wolt/venues/:slug/menu', { params: { slug: slug! } }),
    enabled: !!slug,
    staleTime: 5 * 60_000,
  });

export const useSearch = (q: string) =>
  useQuery({
    queryKey: qk.search(q),
    queryFn: ({ signal }) => api('GET /api/wolt/search', { query: { q }, signal }),
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
  });

// ───────────── presets ─────────────
export const usePresets = () => useQuery({ queryKey: qk.presets, queryFn: () => api('GET /api/presets') });
export const usePreset = (id: string | undefined) =>
  useQuery({ queryKey: qk.preset(id ?? ''), queryFn: () => api('GET /api/presets/:id', { params: { id: id! } }), enabled: !!id && id !== 'new' });

export function useSavePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: PresetInput }) =>
      id ? api('PUT /api/presets/:id', { params: { id }, body: input }) : api('POST /api/presets', { body: input }),
    onSuccess: (p: Preset) => {
      qc.setQueryData(qk.preset(p.id), p);
      qc.setQueryData<Preset[]>(qk.presets, (old) => (old ? upsert(old, p) : old));
      qc.invalidateQueries({ queryKey: qk.presets });
    },
  });
}

export function useDeletePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api('DELETE /api/presets/:id', { params: { id } }),
    onSuccess: (_r, id) => {
      qc.setQueryData<Preset[]>(qk.presets, (old) => old?.filter((p) => p.id !== id));
      qc.invalidateQueries({ queryKey: qk.packs });
    },
  });
}

export function useDuplicatePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api('POST /api/presets/:id/duplicate', { params: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.presets }),
  });
}

// ───────────── packs ─────────────
export const usePacks = () => useQuery({ queryKey: qk.packs, queryFn: () => api('GET /api/packs') });
export const usePack = (id: string | undefined) =>
  useQuery({ queryKey: qk.pack(id ?? ''), queryFn: () => api('GET /api/packs/:id', { params: { id: id! } }), enabled: !!id && id !== 'new' });
export const usePackPreview = (id: string | undefined) =>
  useQuery({
    queryKey: qk.packPreview(id ?? ''),
    queryFn: () => api('GET /api/packs/:id/preview', { params: { id: id! } }),
    enabled: !!id && id !== 'new',
  });

export function useSavePack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: PackInput }) =>
      id ? api('PUT /api/packs/:id', { params: { id }, body: input }) : api('POST /api/packs', { body: input }),
    onSuccess: (p: Pack) => {
      qc.setQueryData(qk.pack(p.id), p);
      qc.invalidateQueries({ queryKey: qk.packs });
    },
  });
}

export function useDeletePack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api('DELETE /api/packs/:id', { params: { id } }),
    onSuccess: (_r, id) => qc.setQueryData<Pack[]>(qk.packs, (old) => old?.filter((p) => p.id !== id)),
  });
}

// ───────────── automations ─────────────
export const useAutomations = () => useQuery({ queryKey: qk.automations, queryFn: () => api('GET /api/automations') });
export const useAutomation = (id: string | undefined) =>
  useQuery({
    queryKey: qk.automation(id ?? ''),
    queryFn: () => api('GET /api/automations/:id', { params: { id: id! } }),
    enabled: !!id && id !== 'new',
  });

export function useSaveAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: AutomationInput }) =>
      id ? api('PUT /api/automations/:id', { params: { id }, body: input }) : api('POST /api/automations', { body: input }),
    onSuccess: (a: Automation) => {
      qc.setQueryData(qk.automation(a.id), a);
      qc.setQueryData<Automation[]>(qk.automations, (old) => (old ? upsert(old, a) : old));
    },
  });
}

export function useToggleAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: Automation) => api('PUT /api/automations/:id', { params: { id: a.id }, body: toAutomationInput({ ...a, enabled: !a.enabled }) }),
    onMutate: async (a) => {
      await qc.cancelQueries({ queryKey: qk.automations });
      const prev = qc.getQueryData<Automation[]>(qk.automations);
      qc.setQueryData<Automation[]>(qk.automations, (old) => old?.map((x) => (x.id === a.id ? { ...x, enabled: !a.enabled } : x)));
      return { prev };
    },
    onError: (_e, _a, ctx) => ctx?.prev && qc.setQueryData(qk.automations, ctx.prev),
    onSuccess: (a) => qc.setQueryData<Automation[]>(qk.automations, (old) => (old ? upsert(old, a) : old)),
  });
}

export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api('DELETE /api/automations/:id', { params: { id } }),
    onSuccess: (_r, id) => qc.setQueryData<Automation[]>(qk.automations, (old) => old?.filter((p) => p.id !== id)),
  });
}

export function useFireAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api('POST /api/automations/:id/fire', { params: { id } }),
    onSuccess: (run) => onRun(qc, run),
  });
}

export function useRotateSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api('POST /api/automations/:id/rotate-secret', { params: { id } }),
    onSuccess: (a) => {
      qc.setQueryData(qk.automation(a.id), a);
      qc.invalidateQueries({ queryKey: qk.automations });
    },
  });
}

export const useDescribeCron = (cron: string, timezone: string) =>
  useQuery({
    queryKey: qk.cron(cron, timezone),
    queryFn: ({ signal }) => api('POST /api/automations/describe-cron', { body: { cron, timezone }, signal }),
    enabled: cron.trim().split(/\s+/).length >= 5,
    retry: 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

export function toAutomationInput(a: Automation): AutomationInput {
  const { id: _id, createdAt: _c, updatedAt: _u, lastFiredAt: _l, nextFireAt: _n, fireCount: _f, ...rest } = a;
  return rest;
}

export function toPresetInput(p: Preset): PresetInput {
  const { id: _id, createdAt: _c, updatedAt: _u, lastRunAt: _l, runCount: _r, ...rest } = p;
  return rest;
}

export function toPackInput(p: Pack): PackInput {
  const { id: _id, createdAt: _c, updatedAt: _u, lastRunAt: _l, runCount: _r, cursor: _cu, history: _h, ...rest } = p;
  return rest;
}

// ───────────── runs ─────────────
export const useRuns = (limit = 50) =>
  useQuery({ queryKey: qk.runs, queryFn: () => api('GET /api/runs', { query: { limit } }) });
export const useRun = (id: string | undefined) =>
  useQuery({ queryKey: qk.run(id ?? ''), queryFn: () => api('GET /api/runs/:id', { params: { id: id! } }), enabled: !!id });

export function onRun(qc: QueryClient, run: Run) {
  qc.setQueryData(qk.run(run.id), run);
  qc.setQueryData<Run[]>(qk.runs, (old) => {
    if (!old) return old;
    const i = old.findIndex((r) => r.id === run.id);
    if (i === -1) return [run, ...old];
    const next = old.slice();
    next[i] = run;
    return next;
  });
}

export function useStartRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RunRequest) => api('POST /api/runs', { body }),
    onSuccess: (run) => {
      onRun(qc, run);
      qc.invalidateQueries({ queryKey: qk.presets });
      qc.invalidateQueries({ queryKey: qk.packs });
    },
  });
}

export function useConfirmRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api('POST /api/runs/:id/confirm', { params: { id } }),
    onSuccess: (run) => onRun(qc, run),
  });
}

export function useCancelRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api('POST /api/runs/:id/cancel', { params: { id } }),
    onSuccess: (run) => onRun(qc, run),
  });
}

// ───────────── fetch (LLM) ─────────────
export const useFetchSearch = () =>
  useMutation({ mutationFn: (query: string) => api('POST /api/fetch', { body: { query, limit: 9 } }) });

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [item, ...list];
  const next = list.slice();
  next[i] = item;
  return next;
}
