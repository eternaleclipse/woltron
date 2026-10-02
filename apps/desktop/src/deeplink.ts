import type { Target } from '@woltron/shared';

export const PROTOCOL = 'woltron';

export type DeepLink = { kind: 'run'; target: Target } | { kind: 'open'; path: string };

/**
 * woltron://run/preset/<id>   → run a preset
 * woltron://run/pack/<id>     → run a pack
 * woltron://open/<path>       → open the app at /<path> (e.g. woltron://open/runs/abc)
 * woltron:// (anything else)  → just open the app
 */
export function parseDeepLink(raw: string): DeepLink | null {
  if (!raw.toLowerCase().startsWith(`${PROTOCOL}:`)) return null;
  // Normalise "woltron:run/..." and "woltron://run/..."; host is the first segment.
  const rest = raw.slice(PROTOCOL.length + 1).replace(/^\/+/, '');
  const [pathPart, query = ''] = rest.split(/\?(.*)/s, 2);
  const segs = pathPart.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  const [action, ...args] = segs;

  if (action === 'run' && (args[0] === 'preset' || args[0] === 'pack') && args[1]) {
    return { kind: 'run', target: { kind: args[0], id: args[1] } };
  }
  if (action === 'open') {
    const p = '/' + args.map(encodeURIComponent).join('/');
    return { kind: 'open', path: query ? `${p}?${query}` : p };
  }
  return { kind: 'open', path: '/' };
}

export function findDeepLinkArg(argv: string[]): string | undefined {
  return argv.find((a) => a.toLowerCase().startsWith(`${PROTOCOL}:`));
}
