'use client';

import { useEffect, useState } from 'react';

const CACHE_KEY = 'gs_geo_cache';
const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 min — same place rarely moves

export interface GeoFix {
  lat: number;
  lng: number;
  /** ms-since-epoch when the fix was obtained */
  ts: number;
}

export interface GeoState {
  fix: GeoFix | null;
  status: 'idle' | 'prompting' | 'ready' | 'denied' | 'unavailable';
  error: string | null;
  /** Manually re-fetch (e.g. after the user grants permission in a settings flow). */
  refresh: () => void;
}

function loadCache(): GeoFix | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as GeoFix;
    if (!cached?.lat || !cached?.lng || !cached?.ts) return null;
    if (Date.now() - cached.ts > CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

function saveCache(fix: GeoFix) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(fix));
  } catch {
    // private mode / quota — silently ignore
  }
}

/**
 * Light wrapper around navigator.geolocation that:
 *   - caches the last known fix for 5 min (avoid re-prompting on every page nav)
 *   - exposes a typed status state machine instead of swallowing errors
 *   - never tracks in the background (only fetched on mount + on refresh())
 *
 * Pass `{ enabled: false }` to short-circuit (e.g. when the user has already
 * declined and we don't want to keep prompting).
 */
export function useGeolocation(opts: { enabled?: boolean } = {}): GeoState {
  const enabled = opts.enabled ?? true;
  const [fix, setFix] = useState<GeoFix | null>(() => loadCache());
  const [status, setStatus] = useState<GeoState['status']>(fix ? 'ready' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      setError('Geolocation not supported on this device.');
      return;
    }
    // Use the cached value if fresh — saves a re-prompt.
    const cached = loadCache();
    if (cached && token === 0) {
      setFix(cached);
      setStatus('ready');
      return;
    }

    setStatus('prompting');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const f: GeoFix = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
        saveCache(f);
        setFix(f);
        setStatus('ready');
        setError(null);
      },
      err => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
          setError('Allow location access in your browser settings to see nearby pickups.');
        } else {
          setStatus('unavailable');
          setError(err.message);
        }
      },
      { enableHighAccuracy: false, maximumAge: CACHE_TTL_MS, timeout: 10000 },
    );
  }, [enabled, token]);

  return {
    fix,
    status,
    error,
    refresh: () => setToken(t => t + 1),
  };
}
