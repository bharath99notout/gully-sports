import Link from 'next/link';
import { formatAdminTime, labelEventType } from '@/features/admin/format';
import { getAdminAuditEvents, requireAdmin } from '@/features/admin/server';

export default async function AdminAuditPage() {
  const { supabase } = await requireAdmin();
  const events = await getAdminAuditEvents(supabase, 100);

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900">
      <div className="border-b border-gray-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Audit log</h2>
        <p className="mt-0.5 text-xs text-gray-500">Latest 100 tracked app events.</p>
      </div>
      <div className="divide-y divide-gray-800">
        {events.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No audit events yet.</p>
        ) : events.map(event => (
          <div key={event.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[180px_1fr_180px]">
            <div>
              <p className="text-xs text-gray-500">{formatAdminTime(event.created_at)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{labelEventType(event.event_type)}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {event.entity_type ?? 'app'}{event.entity_id ? ` · ${event.entity_id.slice(0, 8)}` : ''}
              </p>
              {Object.keys(event.metadata).length > 0 && (
                <pre className="mt-2 max-h-24 overflow-auto rounded-lg bg-gray-950 p-2 text-[11px] text-gray-500">
                  {JSON.stringify(event.metadata, null, 2)}
                </pre>
              )}
            </div>
            <div className="sm:text-right">
              {event.actor_user_id ? (
                <Link href={`/players/${event.actor_user_id}`} className="text-sm font-semibold text-emerald-400 hover:text-emerald-300">
                  {event.actor_name}
                </Link>
              ) : (
                <p className="text-sm font-semibold text-gray-400">{event.actor_name}</p>
              )}
              {event.actor_phone && <p className="mt-0.5 text-xs text-gray-600">{event.actor_phone}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
