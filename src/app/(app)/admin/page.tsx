import Link from 'next/link';
import AdminStatCard from '@/features/admin/AdminStatCard';
import { formatAdminTime, labelEventType } from '@/features/admin/format';
import { getAdminOverview, requireAdmin } from '@/features/admin/server';

export default async function AdminOverviewPage() {
  const { supabase } = await requireAdmin();
  const overview = await getAdminOverview(supabase);

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AdminStatCard label="Total users" value={overview.totalUsers} detail="All profiles" />
        <AdminStatCard label="Active today" value={overview.activeToday} detail="last_seen_at today" />
        <AdminStatCard label="Logins today" value={overview.loginsToday} detail="tracked sessions" />
        <AdminStatCard label="Admin queue" value={overview.adminQueueCount} detail="needs review" />
        <AdminStatCard label="Matches created" value={overview.matchesCreatedToday} detail="today" />
        <AdminStatCard label="Matches completed" value={overview.matchesCompletedToday} detail="today" />
        <AdminStatCard label="Events created" value={overview.eventsCreatedToday} detail="today" />
        <AdminStatCard label="Pickups created" value={overview.pickupsCreatedToday} detail="today" />
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Recent audit</h2>
            <Link href="/admin/audit" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
              View all
            </Link>
          </div>
          <div className="divide-y divide-gray-800">
            {overview.recentAudit.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No audit events yet.</p>
            ) : overview.recentAudit.map(event => (
              <div key={event.id} className="px-4 py-3">
                <p className="text-sm text-white">{labelEventType(event.event_type)}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {event.actor_name} · {formatAdminTime(event.created_at)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Recent matches</h2>
            <Link href="/admin/matches" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
              View matches
            </Link>
          </div>
          <div className="divide-y divide-gray-800">
            {overview.recentMatches.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No matches yet.</p>
            ) : overview.recentMatches.map(match => (
              <Link key={match.id} href={`/matches/${match.id}`} className="block px-4 py-3 hover:bg-gray-800/60">
                <p className="truncate text-sm font-semibold text-white">
                  {match.team_a_name} vs {match.team_b_name}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {match.sport} · {match.status} · {match.player_count} players
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
