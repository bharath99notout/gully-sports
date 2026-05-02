import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Bell } from 'lucide-react';
import { listNotificationsForUser } from '@/lib/notificationsServer';
import { markNotificationRead, markAllNotificationsRead } from '@/app/actions/notifications';
import AutoMarkAllRead from './AutoMarkAllRead';

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const rows = await listNotificationsForUser(user.id);
  const unread = rows.filter(r => !r.read_at);

  return (
    <div className="space-y-6">
      <AutoMarkAllRead />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Bell className="text-emerald-400" size={22} />
            Notifications
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Alerts when a match you played in is recorded and needs confirmation (6h auto-confirm).
          </p>
        </div>
        {unread.length > 0 && (
          <form action={markAllNotificationsRead}>
            <button
              type="submit"
              className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700"
            >
              Mark all read
            </button>
          </form>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center border border-dashed border-gray-800 rounded-xl">
          No notifications yet. When a completed match includes you on the roster, you will see it here.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map(n => (
            <li
              key={n.id}
              className={`rounded-xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                n.read_at ? 'border-gray-800 bg-gray-900/40 opacity-75' : 'border-emerald-900/40 bg-emerald-950/20'
              }`}
            >
              <div className="min-w-0">
                <p className="font-medium text-white text-sm">{n.title}</p>
                <p className="text-sm text-gray-400 mt-1">{n.body}</p>
                <p className="text-[11px] text-gray-600 mt-2">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Link
                  href={`/matches/${n.match_id}`}
                  className="text-sm px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  Open match
                </Link>
                {!n.read_at && (
                  <form action={markNotificationRead}>
                    <input type="hidden" name="notificationId" value={n.id} />
                    <button
                      type="submit"
                      className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
                    >
                      Mark read
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
