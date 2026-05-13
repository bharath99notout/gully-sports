import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { ArrowLeft, MapPin, Clock, Users } from 'lucide-react';
import { createClient, getServerAuth } from '@/lib/supabase/server';
import { getPickupById, getPickupResponses, countMutualMatches } from '@/lib/pickupsServer';
import { formatEventDateTime } from '@/lib/formatDateTime';
import { buildPickupWaContextLine } from '@/lib/pickupShareText';
import SportIcon from '@/components/SportIcon';
import PickupActions from './PickupActions';
import HostApprovalList from './HostApprovalList';
import PickupShareWhatsApp from './PickupShareWhatsApp';

interface Props {
  params: Promise<{ id: string }>;
}

function relativeTime(iso: string): string {
  const diffMin = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (diffMin < -60) return 'started';
  if (diffMin < 0) return 'starting now';
  if (diffMin < 60) return `in ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  return `in ${h}h ${diffMin % 60}m`;
}

export default async function PickupDetailPage({ params }: Props) {
  const { id } = await params;
  const { supabase, user } = await getServerAuth();
  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 text-center">
        <p className="text-gray-300">Sign in to view this pickup.</p>
        <Link href={`/auth/login?next=/pickups/${id}`}
          className="mt-3 inline-block text-emerald-400 hover:underline">Sign in →</Link>
      </div>
    );
  }

  const pickup = await getPickupById(id, user.id);
  if (!pickup) notFound();

  const responses = await getPickupResponses(id);
  const mutualMatches = await countMutualMatches(user.id, pickup.host_id);

  const joinerIds = [...new Set(responses.map(r => r.joiner_id))];
  const mutualEntries = await Promise.all(
    joinerIds.map(async jid => [jid, await countMutualMatches(user.id, jid)] as const),
  );
  const mutualByJoinerId = Object.fromEntries(mutualEntries) as Record<string, number>;

  const isHost = pickup.host_id === user.id;
  const accepted = responses.filter(r => r.status === 'accepted');
  const pending  = responses.filter(r => r.status === 'requested');
  const myResponse = responses.find(r => r.joiner_id === user.id) ?? null;

  const mapUrl = `https://maps.google.com/?q=${pickup.ground_lat},${pickup.ground_lng}`;

  const hdrs = await headers();
  const reqHost = hdrs.get('host') ?? '';
  const proto = hdrs.get('x-forwarded-proto') ?? (reqHost.includes('localhost') ? 'http' : 'https');
  const origin = reqHost
    ? `${proto}://${reqHost}`
    : (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  const appPickupUrl = origin ? `${origin}/pickups/${id}` : `/pickups/${id}`;

  const sportLabel =
    pickup.sport === 'table_tennis' ? 'Table Tennis'
    : pickup.sport.charAt(0).toUpperCase() + pickup.sport.slice(1);

  // Once accepted, host + joiner each get the other's phone (visible only to
  // these two parties, never to other browsers of this page).
  const hostPhone =
    accepted.some(r => r.joiner_id === user.id)
      ? await fetchProfilePhone(pickup.host_id)
      : null;

  const hostDigits = hostPhone ? hostPhone.replace(/\D/g, '').slice(-10) : '';
  const joinerToHostWaText = buildPickupWaContextLine({
    sportLabel,
    groundName: pickup.ground_name,
    startIso: pickup.start_time,
    role: 'joiner',
    counterpartName: pickup.host.name,
  });
  const waHostHref =
    hostPhone && hostDigits.length === 10
      ? `https://wa.me/91${hostDigits}?text=${encodeURIComponent(joinerToHostWaText)}`
      : null;

  const showShareInvite = pickup.status !== 'cancelled' && pickup.status !== 'expired';

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <Link href="/pickups" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200">
        <ArrowLeft size={14} /> Back
      </Link>

      <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/40 border border-emerald-900/60 px-2 py-1 rounded-full">
            <SportIcon sport={pickup.sport} />
            {sportLabel}
          </span>
          <StatusBadge status={pickup.status} />
        </div>

        {/* Body */}
        <div className="px-4 py-4 flex flex-col gap-3">
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">Host</p>
            <p className="text-sm">
              <Link
                href={`/players/${pickup.host.id}`}
                className="text-white hover:text-emerald-300 hover:underline"
              >
                {pickup.host.name}
              </Link>
              {!isHost && mutualMatches > 0 && (
                <span className="ml-1.5 text-[11px] text-emerald-400">
                  · {mutualMatches} mutual match{mutualMatches === 1 ? '' : 'es'}
                </span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field icon={<MapPin size={13} />} label="Ground" value={pickup.ground_name}
              href={mapUrl} />
            <Field icon={<Clock size={13} />} label="Starts" value={`${formatEventDateTime(pickup.start_time)} · ${relativeTime(pickup.start_time)}`} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field icon={<Users size={13} />} label="Slots"
              value={`${accepted.length} / ${pickup.slots_total} filled`} />
            <Field label="Format" value={pickup.format || '—'} />
          </div>

          {pickup.notes && (
            <div className="rounded-xl bg-gray-800/40 border border-gray-800 px-3 py-2">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm text-gray-200 whitespace-pre-wrap">{pickup.notes}</p>
            </div>
          )}

          {/* Accepted joiner -> show host's phone for WhatsApp handoff */}
          {waHostHref && (
            <a
              href={waHostHref}
              target="_blank" rel="noreferrer"
              className="rounded-xl border border-emerald-700 bg-emerald-950/40 px-3 py-2.5 text-sm text-emerald-300 font-semibold text-center hover:bg-emerald-900/60"
            >
              💬 WhatsApp host ({hostPhone})
            </a>
          )}
        </div>

        {showShareInvite && (
          <div className="px-4 pb-3">
            <PickupShareWhatsApp
              fields={{
                sportLabel,
                hostName: pickup.host.name,
                startIso: pickup.start_time,
                groundName: pickup.ground_name,
                slotsTotal: pickup.slots_total,
                acceptedCount: accepted.length,
                format: pickup.format,
                notes: pickup.notes,
                mapUrl,
                appPickupUrl,
              }}
            />
          </div>
        )}

        {/* Actions */}
        <div className="px-4 pb-4">
          <PickupActions
            pickup={pickup}
            isHost={isHost}
            myResponse={myResponse}
          />
        </div>
      </div>

      {/* Host approval list */}
      {isHost && (
        <div className="mt-4">
          <HostApprovalList
            pending={pending}
            accepted={accepted}
            allResponses={responses}
            requestId={pickup.id}
            slotsTotal={pickup.slots_total}
            startTimeIso={pickup.start_time}
            sportLabel={sportLabel}
            groundName={pickup.ground_name}
            mutualByJoinerId={mutualByJoinerId}
          />
        </div>
      )}
    </div>
  );
}

async function fetchProfilePhone(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('phone').eq('id', userId).single();
  return data?.phone ?? null;
}

function Field({ icon, label, value, href }: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-[11px] text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-sm ${href ? 'text-emerald-300 underline' : 'text-white'} truncate flex items-center gap-1`}>
        {icon}
        {value}
      </p>
    </>
  );
  return href
    ? <a href={href} target="_blank" rel="noreferrer">{inner}</a>
    : <div>{inner}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open:      'text-emerald-300 bg-emerald-950/40 border-emerald-900',
    filled:    'text-blue-300 bg-blue-950/40 border-blue-900',
    cancelled: 'text-gray-400 bg-gray-800/40 border-gray-700',
    expired:   'text-gray-500 bg-gray-800/30 border-gray-800',
  };
  const cls = map[status] ?? map.expired;
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cls}`}>
      {status}
    </span>
  );
}
