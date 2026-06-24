import Link from 'next/link';
import { formatAdminTime } from '@/features/admin/format';
import { getAdminUsers, requireAdmin } from '@/features/admin/server';

export default async function AdminUsersPage() {
  const { supabase } = await requireAdmin();
  const users = await getAdminUsers(supabase, 50);

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900">
      <div className="border-b border-gray-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Users</h2>
        <p className="mt-0.5 text-xs text-gray-500">Latest 50 users by activity.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-gray-500">
            <tr className="border-b border-gray-800">
              <th className="px-4 py-3 font-semibold">User</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">Last login</th>
              <th className="px-4 py-3 font-semibold">Last seen</th>
              <th className="px-4 py-3 font-semibold text-right">Played</th>
              <th className="px-4 py-3 font-semibold text-right">Created</th>
              <th className="px-4 py-3 font-semibold text-right">No-shows</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {users.map(user => (
              <tr key={user.id} className="text-gray-300">
                <td className="px-4 py-3">
                  <Link href={`/players/${user.id}`} className="font-semibold text-white hover:text-emerald-400">
                    {user.name}
                  </Link>
                  {user.is_admin && <span className="ml-2 rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] text-amber-300">Admin</span>}
                  <p className="mt-0.5 text-xs text-gray-600">Joined {formatAdminTime(user.created_at)}</p>
                </td>
                <td className="px-4 py-3 text-gray-400">{user.phone ?? '-'}</td>
                <td className="px-4 py-3 text-gray-400">{formatAdminTime(user.last_login_at)}</td>
                <td className="px-4 py-3 text-gray-400">{formatAdminTime(user.last_seen_at)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{user.matches_played}</td>
                <td className="px-4 py-3 text-right tabular-nums">{user.matches_created}</td>
                <td className="px-4 py-3 text-right tabular-nums">{user.reliability_no_shows}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
