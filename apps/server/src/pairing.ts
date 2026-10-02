import os from 'node:os';
import QRCode from 'qrcode';
import type { PairingInfo } from '@woltron/shared';

/** Non-internal IPv4 addresses, private ranges first. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  const isPrivate = (ip: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  return [...new Set(out)].sort((a, b) => Number(isPrivate(b)) - Number(isPrivate(a)));
}

export async function pairingInfo(opts: { enabled: boolean; port: number; token: string }): Promise<PairingInfo> {
  const urls = lanAddresses().map((ip) => `http://${ip}:${opts.port}/?token=${encodeURIComponent(opts.token)}`);
  let qrSvg: string | undefined;
  if (urls[0]) {
    qrSvg = await QRCode.toString(urls[0], { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
  }
  return { enabled: opts.enabled, urls, token: opts.token, ...(qrSvg ? { qrSvg } : {}) };
}
