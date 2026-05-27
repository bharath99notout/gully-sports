'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MapPin, Clock, Users, Plus } from 'lucide-react';
import { useGeolocation } from '@/lib/useGeolocation';
import SportIcon from '@/components/SportIcon';
import type { PickupRequestWithMeta, SportType } from '@/types';

/**
 * Playo-style discover: horizontal day chips, time-bucketed list per day.
 *
 * Days come from grouping pickups by their LOCAL calendar date (the viewer's
 * timezone), not UTC — a 9pm pickup belongs to today, not tomorrow.
 *
 * Within a day, pickups bucket into Morning (06-12), Afternoon (12-17),
 * Evening (17-21), Night (21-06).
 */

type Bucket = 'morning' | 'afternoon' | 'evening' | 'night';

const SPORT_FILTERS: { key: SportType | 'all'; label: string }[] = [
  { key: 'all',          label: 'All' },
  { key: 'cricket',      label: 'Cricket' },
  { key: 'football',     label: 'Football' },
  { key: 'badminton',    label: 'Badminton' },
  { key: 'table_tennis', label: 'TT' },
  { key: 'pickleball',   label: 'Pickleball' },
  { key: 'foosball',     label: 'Foosball' },
];

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayKey(): string {
  return dayKey(new Date().toISOString());
}

function tomorrowKey(): string {
  return dayKey(new Date(Date.now() + 24 * 3600 * 1000).toISOString());
}

function dayChipLabel(key: string): { primary: string; secondary: string } {
  const today = todayKey();
  const tomorrow = tomorrowKey();
  if (key === today)    return { primary: 'Today',    secondary: '' };
  if (key === tomorrow) return { primary: 'Tomorrow', secondary: '' };
  const d = new Date(`${key}T00:00:00`);
  return {
    primary:   d.toLocaleDateString('en-IN', { weekday: 'short' }),
    secondary: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
  };
}

function timeBucket(iso: string): Bucket {
  const h = new Date(iso).getHours();
  if (h >= 6  && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

const BUCKET_LABEL: Record<Bucket, string> = {
  morning:   'Morning · 6 am – 12 pm',
  afternoon: 'Afternoon · 12 pm – 5 pm',
  evening:   'Evening · 5 pm – 9 pm',
  night:     'Night · 9 pm onwards',
};

const BUCKET_ORDER: Bucket[] = ['morning', 'afternoon', 'evening', 'night'];

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric', minute: '2-digit',
  });
}

function relTime(iso: string): string {
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (diff < -60)  return 'past';
  if (diff < 0)    return 'starting now';
  if (diff < 60)   return `in ${diff}m`;
  if (diff < 1440) {
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
  }
  const d = Math.floor(diff / 1440);
  return `in ${d}d`;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export default function DiscoverByDay({
  initialItems, viewerId,
}: {
  initialItems: PickupRequestWithMeta[];
  viewerId: string;
}) {
  const geo = useGeolocation();
  const [sport, setSport] = useState<SportType | 'all'>('all');

  // Decorate with viewer-local distance when GPS is available.
  // (Server can't compute this — it doesn't know the viewer's coords.)
  const items = useMemo(() => {
    if (!geo.fix) return initialItems;
    return initialItems.map(p => ({
      ...p,
      distance_km: haversineKm(geo.fix!.lat, geo.fix!.lng, p.ground_lat, p.ground_lng),
    }));
  }, [initialItems, geo.fix]);

  const filtered = useMemo(
    () => sport === 'all' ? items : items.filter(p => p.sport === sport),
    [items, sport],
  );

  // Group by day → ordered list of (day, items[])
  const grouped = useMemo(() => {
    const map = new Map<string, PickupRequestWithMeta[]>();
    for (const p of filtered) {
      const k = dayKey(p.start_time);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Track only the explicit user choice; the *effective* selected day is
  // derived from chosenDay + grouped, so default-selection happens during
  // render without an extra effect-triggered re-render.
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const selectedDay =
    chosenDay && grouped.some(([k]) => k === chosenDay)
      ? chosenDay
      : grouped[0]?.[0] ?? null;

  // Bucket the selected day's items by time-of-day
  const buckets = useMemo(() => {
    const selectedItems = grouped.find(([k]) => k === selectedDay)?.[1] ?? [];
    const out: Record<Bucket, PickupRequestWithMeta[]> = {
      morning: [], afternoon: [], evening: [], night: [],
    };
    for (const p of selectedItems) out[timeBucket(p.start_time)].push(p);
    for (const b of BUCKET_ORDER) {
      out[b].sort((a, c) => a.start_time.localeCompare(c.start_time));
    }
    return out;
  }, [grouped, selectedDay]);

  return (
    <div className="flex flex-col gap-4">
      {/* Sport filter */}
      <div className="-mx-4 px-4 overflow-x-auto">
        <div className="flex items-center gap-2 w-max">
          {SPORT_FILTERS.map(f => {
            const active = sport === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setSport(f.key)}
                className={`shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-emerald-500 text-gray-950'
                    : 'bg-gray-900 text-gray-300 border border-gray-800 hover:border-gray-700'
                }`}
              >
                {f.key !== 'all' && <SportIcon sport={f.key} className="text-sm leading-none" />}
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day chips */}
      <div className="sticky top-0 z-10 -mx-4 px-4 bg-gray-950/95 backdrop-blur supports-[backdrop-filter]:bg-gray-950/80 py-2 border-b border-gray-900">
        {grouped.length === 0 ? (
          <p className="text-xs text-gray-500 italic py-1">
            No open pickups in the next 14 days{sport !== 'all' ? ` for ${sport}` : ''}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex items-stretch gap-2 w-max">
              {grouped.map(([k, list]) => {
                const active = k === selectedDay;
                const { primary, secondary } = dayChipLabel(k);
                return (
                  <button
                    key={k}
                    onClick={() => setChosenDay(k)}
                    className={`shrink-0 flex flex-col items-center justify-center min-w-[68px] rounded-xl px-3 py-2 transition-colors ${
                      active
                        ? 'bg-emerald-500 text-gray-950'
                        : 'bg-gray-900 text-gray-300 border border-gray-800 hover:border-gray-700'
                    }`}
                  >
                    <span className={`text-xs font-bold leading-tight ${active ? '' : 'text-white'}`}>
                      {primary}
                    </span>
                    {secondary && (
                      <span className={`text-[10px] leading-tight ${active ? 'text-gray-900' : 'text-gray-500'}`}>
                        {secondary}
                      </span>
                    )}
                    <span className={`mt-1 text-[10px] font-bold tabular-nums ${
                      active ? 'text-gray-900' : 'text-amber-400'
                    }`}>
                      {list.length} {list.length === 1 ? 'game' : 'games'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      {grouped.length === 0 ? (
        <Link
          href="/pickups/new"
          className="rounded-2xl border border-dashed border-gray-700 hover:border-emerald-700 bg-gray-900/40 hover:bg-emerald-950/20 px-4 py-6 text-center transition-colors"
        >
          <p className="text-sm text-gray-400">Be the first to post one.</p>
          <p className="text-base font-semibold text-emerald-400 mt-1 inline-flex items-center gap-1">
            <Plus size={14} /> Post a pickup
          </p>
        </Link>
      ) : (
        <div className="flex flex-col gap-5">
          {BUCKET_ORDER.map(b => {
            const list = buckets[b];
            if (list.length === 0) return null;
            return (
              <section key={b} className="flex flex-col gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">
                  {BUCKET_LABEL[b]}
                </h3>
                <div className="flex flex-col gap-2">
                  {list.map(p => (
                    <PickupRow key={p.id} pickup={p} viewerId={viewerId} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PickupRow({ pickup, viewerId }: { pickup: PickupRequestWithMeta; viewerId: string }) {
  const slotsLeft = pickup.slots_total - pickup.accepted_count;
  const isHost = pickup.host_id === viewerId;
  const responded = pickup.viewer_response?.status;
  return (
    <Link
      href={`/pickups/${pickup.id}`}
      className="block rounded-2xl border border-gray-800 bg-gray-900 hover:border-emerald-700 transition-colors px-4 py-3"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-300 uppercase tracking-wider">
          <SportIcon sport={pickup.sport} className="text-sm leading-none" />
          {pickup.sport === 'table_tennis' ? 'Table Tennis' : pickup.sport.charAt(0).toUpperCase() + pickup.sport.slice(1)}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {pickup.distance_km != null && (
            <span className="text-[10px] text-gray-500 tabular-nums">
              {pickup.distance_km.toFixed(1)} km
            </span>
          )}
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
            <Users size={10} className="inline -mt-0.5" /> {slotsLeft} left
          </span>
        </div>
      </div>

      <p className="text-sm font-bold text-white truncate">
        {isHost ? 'Your post' : pickup.host.name}
        {pickup.format && (
          <span className="ml-1.5 text-xs font-medium text-gray-500">· {pickup.format}</span>
        )}
      </p>

      <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5">
        <MapPin size={11} className="text-emerald-400 shrink-0" /> {pickup.ground_name}
      </p>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500 inline-flex items-center gap-1 tabular-nums">
          <Clock size={11} /> {fmtTime(pickup.start_time)} · {relTime(pickup.start_time)}
        </span>
        {!isHost && (
          responded === 'accepted' ? (
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">✓ In</span>
          ) : responded === 'requested' ? (
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Pending</span>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Join →</span>
          )
        )}
        {isHost && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Manage →</span>
        )}
      </div>
    </Link>
  );
}
