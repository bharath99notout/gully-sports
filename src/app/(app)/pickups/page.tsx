import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, MapPin, Clock } from 'lucide-react';
import { getServerAuth } from '@/lib/supabase/server';
import { getMyPickups } from '@/lib/pickupsServer';
import SportIcon from '@/components/SportIcon';
import type { PickupRequestWithMeta } from '@/types';

export const metadata = {
  title: 'My Pickups – GullySports',
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

function relative(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 60000;
  if (diff < -60) return 'past';
  if (diff < 0)  return 'now';
  if (diff < 60) return `in ${Math.round(diff)} min`;
  return `in ${Math.round(diff / 60)} hr`;
}

export default async function MyPickupsPage() {
  const { user } = await getServerAuth();
  if (!user) redirect('/auth/login?next=/pickups');

  const { hosted, joined } = await getMyPickups(user.id);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">My Pickups</h1>
        <Link
          href="/pickups/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold"
        >
          <Plus size={14} /> New
        </Link>
      </div>

      <Section title="Hosting" empty="No pickups you've posted." items={hosted} viewerId={user.id} role="host" />
      <Section title="Joined / Pending" empty="You haven't joined any pickups yet." items={joined} viewerId={user.id} role="joiner" />
    </div>
  );
}

function Section({ title, empty, items, viewerId, role }: {
  title: string;
  empty: string;
  items: PickupRequestWithMeta[];
  viewerId: string;
  role: 'host' | 'joiner';
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-300 mb-3">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500 italic">{empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(p => <PickupRow key={p.id} pickup={p} viewerId={viewerId} role={role} />)}
        </div>
      )}
    </div>
  );
}

function PickupRow({ pickup, role }: {
  pickup: PickupRequestWithMeta;
  viewerId: string;
  role: 'host' | 'joiner';
}) {
  const myStatus = pickup.viewer_response?.status;
  const tagText =
    role === 'host'
      ? pickup.status
      : (myStatus ?? '—');
  const tagColor =
    pickup.status === 'open'
      ? 'text-emerald-400 border-emerald-900'
      : pickup.status === 'filled'
        ? 'text-blue-400 border-blue-900'
        : 'text-gray-500 border-gray-700';

  return (
    <Link
      href={`/pickups/${pickup.id}`}
      className="block rounded-2xl border border-gray-800 bg-gray-900 hover:border-gray-700 transition-colors px-4 py-3"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-300">
          <SportIcon sport={pickup.sport} />
          {pickup.sport === 'table_tennis' ? 'Table Tennis' : pickup.sport.charAt(0).toUpperCase() + pickup.sport.slice(1)}
        </span>
        <span className={`text-[10px] font-bold uppercase tracking-wider border px-1.5 py-0.5 rounded ${tagColor}`}>
          {tagText}
        </span>
      </div>
      <p className="text-sm text-white truncate flex items-center gap-1">
        <MapPin size={12} className="text-emerald-400 shrink-0" />
        {pickup.ground_name}
      </p>
      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
        <Clock size={11} />
        {fmtTime(pickup.start_time)} · {relative(pickup.start_time)} · {pickup.accepted_count}/{pickup.slots_total} filled
      </p>
    </Link>
  );
}
