import 'server-only';
import { cache } from 'react';

// venue_name is free text. People routinely paste a shortened Google Maps
// link (https://maps.app.goo.gl/…) which carries no readable place name. We
// follow the link server-side and pull the name out of the expanded URL's
// `q=` param (or `/maps/place/<name>/`). No API key required. Result is cached
// for a day via Next's fetch cache; resolveVenue itself is request-deduped.

const URL_RE = /^https?:\/\//i;

export type VenueDisplay = {
  /** Short, human-readable label to show (place name). */
  label: string;
  /** Fuller text for the title/hover tooltip (address when we have it). */
  full: string;
  /** Best link target for the venue. */
  href: string;
};

function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function tidy(s: string): string {
  return decodeURIComponent(s.replace(/\+/g, ' ')).replace(/\s+/g, ' ').trim();
}

function isCoords(s: string): boolean {
  return /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(s.trim());
}

/** Pull a readable place name from an expanded Google Maps URL, if present. */
function placeFromUrl(u: string): { label: string; full: string } | null {
  try {
    const parsed = new URL(u);
    const q = parsed.searchParams.get('q');
    if (q && !isCoords(q)) {
      const full = tidy(q);
      if (full) return { label: full.split(',')[0].trim() || full, full };
    }
    const m = parsed.pathname.match(/\/maps\/place\/([^/@]+)/);
    if (m) {
      const full = tidy(m[1]);
      if (full && !isCoords(full)) return { label: full.split(',')[0].trim() || full, full };
    }
    return null;
  } catch {
    return null;
  }
}

/** Follow redirects and return the final URL (or null on failure/timeout). */
async function expandUrl(shortUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(shortUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; GullySports/1.0)' },
      next: { revalidate: 86400 },
    });
    return res.url || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const resolveVenue = cache(async (
  venueName: string,
  venueMapUrl?: string | null,
): Promise<VenueDisplay> => {
  const raw = venueName.trim();
  if (!URL_RE.test(raw)) {
    return { label: raw, full: raw, href: venueMapUrl || mapsSearchUrl(raw) };
  }
  const href = venueMapUrl || raw;
  const finalUrl = await expandUrl(raw);
  const place = finalUrl ? placeFromUrl(finalUrl) : null;
  if (place) return { label: place.label, full: place.full, href };
  return { label: 'View location', full: 'View location', href };
});
