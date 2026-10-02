import type { GeoLocation } from '@woltron/shared';

/** Tel Aviv city centre — the default location everywhere in Woltron. */
export const DEFAULT_LOCATION: GeoLocation = { lat: 32.0853, lon: 34.7818, address: 'Tel Aviv-Yafo, Israel', label: 'Tel Aviv' };

/** Great-circle distance in metres. */
export function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Ray-casting point-in-polygon for GeoJSON Polygon / MultiPolygon coordinates ([lon, lat]). */
export function pointInGeoJson(geo: { type?: string; coordinates?: any } | null | undefined, lat: number, lon: number): boolean | undefined {
  if (!geo || !Array.isArray(geo.coordinates)) return undefined;
  const polys: number[][][][] = geo.type === 'MultiPolygon' ? geo.coordinates : geo.type === 'Polygon' ? [geo.coordinates] : [];
  if (!polys.length) return undefined;
  return polys.some((rings) => {
    if (!rings.length || !inRing(rings[0], lat, lon)) return false;
    return !rings.slice(1).some((hole) => inRing(hole, lat, lon));
  });
}

function inRing(ring: number[][], lat: number, lon: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Builds wolt.com URLs. country is ISO alpha-3 (e.g. "ISR"), city is Wolt's city slug ("tel-aviv"). */
export function venueUrl(p: { language?: string; country?: string; city?: string; slug: string; productLine?: string }): string {
  const lang = p.language || 'en';
  if (!p.country || !p.city) return `https://wolt.com/${lang}/search?q=${encodeURIComponent(p.slug)}`;
  const type = !p.productLine || p.productLine === 'restaurant' ? 'restaurant' : 'venue';
  return `https://wolt.com/${lang}/${p.country.toLowerCase()}/${p.city.toLowerCase()}/${type}/${p.slug}`;
}

/** Parse a wolt.com share URL (https://wolt.com/he/isr/tel-aviv/restaurant/hamosad). */
export function parseShareUrl(url: string | undefined): { country?: string; city?: string; type?: string; slug?: string } {
  if (!url) return {};
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    // [lang, country, city, type, slug]
    if (parts.length >= 5) return { country: parts[1], city: parts[2], type: parts[3], slug: parts[4] };
  } catch {
    /* ignore */
  }
  return {};
}

export const checkoutUrlFor = (venueUrlStr: string) => (venueUrlStr.includes('/search?') ? venueUrlStr : `${venueUrlStr}/checkout`);
export const orderTrackingUrl = (orderId: string, language = 'en') => `https://wolt.com/${language}/me/order-tracking/${orderId}`;
