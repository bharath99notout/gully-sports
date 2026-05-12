'use client';

import { useEffect, useState } from 'react';
import { Loader2, Bell, BellOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { SportType } from '@/types';

const ALL_SPORTS: { value: SportType; label: string }[] = [
  { value: 'cricket',      label: 'Cricket' },
  { value: 'football',     label: 'Football' },
  { value: 'badminton',    label: 'Badminton' },
  { value: 'table_tennis', label: 'Table Tennis' },
  { value: 'foosball',     label: 'Foosball' },
];

const RADIUS_OPTIONS = [1, 3, 5, 10, 25] as const;

interface PickupPrefs {
  pickup_opt_in: boolean;
  pickup_radius_km: number;
  pickup_sports: SportType[];
  pickup_quiet_start: string;   // 'HH:MM:SS'
  pickup_quiet_end: string;
}

interface Props {
  userId: string;
  initial: PickupPrefs;
  vapidPublicKey: string;
}

/**
 * Pickup notification preferences + browser push subscribe flow.
 * Toggling "Enable" both:
 *   1. Persists the opt-in flag on profiles
 *   2. Requests browser Notification permission + subscribes the SW for push
 *      (so the push fan-out has somewhere to deliver to).
 */
export default function PickupSettings({ userId, initial, vapidPublicKey }: Props) {
  const supabase = createClient();
  const [optIn, setOptIn] = useState(initial.pickup_opt_in);
  const [radius, setRadius] = useState(initial.pickup_radius_km);
  const [sports, setSports] = useState<SportType[]>(initial.pickup_sports ?? []);
  const [quietStart, setQuietStart] = useState(toHHMM(initial.pickup_quiet_start));
  const [quietEnd,   setQuietEnd]   = useState(toHHMM(initial.pickup_quiet_end));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pushSupported, setPushSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setPushSupported(
      typeof window !== 'undefined'
      && 'serviceWorker' in navigator
      && 'PushManager' in window
    );
  }, []);

  async function ensurePushSubscription(): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError('Browser notifications were not allowed. Enable them in site settings.');
        return false;
      }
      // Browser typings disagree with each other on whether `applicationServerKey`
      // accepts a Uint8Array — at runtime it does. Cast through unknown to
      // bypass the structural mismatch (SharedArrayBuffer vs ArrayBuffer).
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
      });
    }
    // POST to backend
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        userAgent: navigator.userAgent,
      }),
    });
    if (!res.ok) {
      setError('Failed to save push subscription.');
      return false;
    }
    return true;
  }

  async function removePushSubscription() {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);

    // If turning ON, set up the push subscription first.
    if (optIn) {
      const ok = await ensurePushSubscription();
      if (!ok) { setBusy(false); setOptIn(false); return; }
    } else {
      await removePushSubscription();
    }

    const { error: upErr } = await supabase
      .from('profiles')
      .update({
        pickup_opt_in:      optIn,
        pickup_radius_km:   radius,
        pickup_sports:      sports,
        pickup_quiet_start: quietStart + ':00',
        pickup_quiet_end:   quietEnd   + ':00',
      })
      .eq('id', userId);
    setBusy(false);
    if (upErr) { setError(upErr.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function toggleSport(s: SportType) {
    setSports(curr => curr.includes(s) ? curr.filter(x => x !== s) : [...curr, s]);
  }

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
          {optIn ? <Bell size={14} className="text-emerald-400" /> : <BellOff size={14} className="text-gray-500" />}
          Pickup notifications
        </h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Get a push when someone nearby needs players for a sport you play.
      </p>

      {pushSupported === false && (
        <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-300 mb-3">
          Push isn&apos;t supported on this browser. Install GullySports as a home-screen app
          and reopen in Chrome / Safari for notifications.
        </div>
      )}

      {/* Master toggle */}
      <label className="flex items-center justify-between py-2.5 cursor-pointer">
        <span className="text-sm text-white">Enable</span>
        <input
          type="checkbox"
          className="w-4 h-4 accent-emerald-500"
          checked={optIn}
          onChange={e => setOptIn(e.target.checked)}
        />
      </label>

      {optIn && (
        <div className="flex flex-col gap-4 mt-2">
          {/* Sports */}
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Sports of interest</p>
            <div className="flex flex-wrap gap-2">
              {ALL_SPORTS.map(s => (
                <button
                  key={s.value} type="button"
                  onClick={() => toggleSport(s.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    sports.includes(s.value)
                      ? 'border-emerald-600 bg-emerald-950/40 text-emerald-300'
                      : 'border-gray-800 bg-gray-900 text-gray-400 hover:border-gray-700'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-600 mt-1">Leave empty to get all sports.</p>
          </div>

          {/* Radius */}
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Radius</p>
            <div className="flex gap-2 flex-wrap">
              {RADIUS_OPTIONS.map(r => (
                <button
                  key={r} type="button"
                  onClick={() => setRadius(r)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                    radius === r
                      ? 'border-emerald-600 bg-emerald-950/40 text-emerald-300'
                      : 'border-gray-800 bg-gray-900 text-gray-400 hover:border-gray-700'
                  }`}>
                  {r} km
                </button>
              ))}
            </div>
          </div>

          {/* Quiet hours */}
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Quiet hours (no pings)</p>
            <div className="flex items-center gap-3 text-sm">
              <input
                type="time" value={quietStart}
                onChange={e => setQuietStart(e.target.value)}
                className="rounded-lg border border-gray-800 bg-gray-900 px-2 py-1.5 text-white outline-none focus:border-emerald-600 text-xs"
              />
              <span className="text-gray-500 text-xs">to</span>
              <input
                type="time" value={quietEnd}
                onChange={e => setQuietEnd(e.target.value)}
                className="rounded-lg border border-gray-800 bg-gray-900 px-2 py-1.5 text-white outline-none focus:border-emerald-600 text-xs"
              />
            </div>
          </div>
        </div>
      )}

      <button
        onClick={save}
        disabled={busy}
        className="mt-5 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        Save preferences
      </button>
      {error && <p className="mt-2 text-xs text-red-400 text-center">{error}</p>}
      {saved && <p className="mt-2 text-xs text-emerald-400 text-center">Saved ✓</p>}
    </section>
  );
}

function toHHMM(time: string | null | undefined): string {
  if (!time) return '22:00';
  const m = /^(\d{2}):(\d{2})/.exec(time);
  if (m) return `${m[1]}:${m[2]}`;
  return '22:00';
}

// urlBase64 → Uint8Array (web-push standard for VAPID public key)
function urlBase64ToUint8Array(s: string): Uint8Array {
  const padding = '='.repeat((4 - (s.length % 4)) % 4);
  const base64 = (s + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf;
}
