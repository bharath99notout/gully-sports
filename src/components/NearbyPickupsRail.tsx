'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, Clock, Plus, Users, AlertCircle } from 'lucide-react';
import { useGeolocation } from '@/lib/useGeolocation';
import SportIcon from '@/components/SportIcon';
import type { PickupRequestWithMeta } from '@/types';

/**
 * Client-side fetched rail of nearby pickups. We fetch from a server endpoint
 * rather than passing data in via props because the rail depends on GPS, which
 * only the browser can provide. Server-side render gives an empty rail; the
 * client effect fills it once geolocation resolves.
 *
 * Endpoint: GET /api/pickups/nearby?lat=...&lng=...&radius_km=...
 *
 * `viewerId` is required so we never show "JOIN" on the viewer's own pickup
 * (they should see a host/manage affordance instead).
 */
export default function NearbyPickupsRail({ viewerId }: { viewerId: string }) {
  const geo = useGeolocation();
  const [items, setItems] = useState<PickupRequestWithMeta[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!geo.fix) return;
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/pickups/nearby?lat=${geo.fix.lat}&lng=${geo.fix.lng}&radius_km=10`, {
      signal: ctrl.signal,
    })
      .then(r => r.json())
      .then((data: { items: PickupRequestWithMeta[] }) => {
        setItems(data.items ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [geo.fix]);

  // Hide the whole rail until GPS resolves — we don't want to flash an empty
  // state before we know whether there's anything nearby. Same applies if the
  // user denies access; we surface a single inline opt-in nudge instead.
  if (geo.status === 'idle' || geo.status === 'prompting') return null;

  if (geo.status === 'denied' || geo.status === 'unavailable') {
    return (
      <Header>
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-3 py-2.5 flex items-center gap-2.5 text-xs text-gray-400">
          <AlertCircle size={13} className="text-amber-400 shrink-0" />
          <span className="flex-1">
            Allow location access to see nearby pickups.
          </span>
          <button onClick={geo.refresh} className="text-emerald-400 font-semibold underline">
            Retry
          </button>
        </div>
      </Header>
    );
  }

  if (loading && items === null) {
    return (
      <Header>
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-3 py-3 text-xs text-gray-500">
          Looking for nearby pickups…
        </div>
      </Header>
    );
  }

  if (!items || items.length === 0) {
    return (
      <Header>
        <Link
          href="/pickups/new"
          className="block rounded-xl border border-dashed border-gray-700 hover:border-emerald-700 bg-gray-900/40 hover:bg-emerald-950/20 px-4 py-3 text-center transition-colors"
        >
          <p className="text-xs text-gray-400">No pickups within 10 km right now.</p>
          <p className="text-sm font-semibold text-emerald-400 mt-1">+ Post your own</p>
        </Link>
      </Header>
    );
  }

  return (
    <Header showAction>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {items.map(p => <PickupCard key={p.id} pickup={p} viewerId={viewerId} />)}
      </div>
    </Header>
  );
}

function Header({ children, showAction = false }: { children: React.ReactNode; showAction?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
          <h2 className="text-sm font-semibold text-white">Need Players Now</h2>
        </div>
        {showAction && (
          <Link href="/pickups/new" className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline">
            <Plus size={12} /> Post yours
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function PickupCard({ pickup, viewerId }: { pickup: PickupRequestWithMeta; viewerId: string }) {
  const slotsLeft = pickup.slots_total - pickup.accepted_count;
  const isHost = pickup.host_id === viewerId;
  return (
    <Link
      href={`/pickups/${pickup.id}`}
      className="shrink-0 w-60 rounded-2xl border border-gray-800 bg-gray-900 hover:border-amber-700 transition-colors p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-300 uppercase tracking-wider">
          <SportIcon sport={pickup.sport} />
          {pickup.sport === 'table_tennis' ? 'TT' : pickup.sport}
        </span>
        {pickup.distance_km != null && (
          <span className="text-[10px] text-gray-500 tabular-nums">{pickup.distance_km.toFixed(1)} km</span>
        )}
      </div>
      <p className="text-sm font-bold text-white truncate">{isHost ? 'You' : pickup.host.name}</p>
      <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-1">
        <MapPin size={11} /> {pickup.ground_name}
      </p>
      <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
        <Clock size={11} /> {relTime(pickup.start_time)}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-bold min-w-0">
          <Users size={11} className="shrink-0" /> {slotsLeft} slot{slotsLeft === 1 ? '' : 's'} left
        </span>
        {isHost ? (
          <span className="text-[10px] text-gray-400 font-bold shrink-0 text-right">
            Your post · <span className="text-amber-400">Manage →</span>
          </span>
        ) : (
          <span className="text-[10px] text-emerald-400 font-bold shrink-0">JOIN →</span>
        )}
      </div>
    </Link>
  );
}

function relTime(iso: string): string {
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (diff < -60) return 'past';
  if (diff < 0)   return 'starting now';
  if (diff < 60)  return `in ${diff} min`;
  if (diff < 1440) {
    const h = Math.floor(diff / 60);
    return `in ${h}h ${diff % 60}m`;
  }
  const d = Math.floor(diff / 1440);
  const rem = diff % 1440;
  const h = Math.floor(rem / 60);
  if (d <= 14) return h > 0 ? `in ${d}d ${h}h` : `in ${d}d`;
  return `in ${d}d+`;
}
