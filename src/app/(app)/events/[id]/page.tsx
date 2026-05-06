import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays, MapPin, Users, Hourglass, X as XIcon, Flame } from 'lucide-react';
import { getEvent } from '@/lib/eventsServer';
import { createClient } from '@/lib/supabase/server';
import EventActions from './EventActions';
import GuestRsvpForm from './GuestRsvpForm';
import CostSplitSection from './CostSplitSection';
import EventMatchesSection from './EventMatchesSection';
import HostControls from './HostControls';
import { formatEventDateTime } from '@/lib/formatDateTime';
import type { SportType } from '@/types';

/** Build a Google Maps "search by name" URL — works without coordinates and
 *  handles "Sarjapur" or "Indiranagar Park, Bengaluru" equally well. */
function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

const SPORT_EMOJI: Record<string, string> = {
  cricket: '🏏', football: '⚽', badminton: '🏸', table_tennis: '🏓',
};

interface RsvpRow {
  id: string;
  player_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  status: 'going' | 'maybe' | 'not_going' | 'waitlist';
  attended: boolean | null;
  responded_at: string;
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isHost = !!user && user.id === event.host_id;

  const [
    { data: hostProfile },
    { data: rsvpsRaw },
    { data: costRow },
    { data: assignmentsRaw },
  ] = await Promise.all([
    supabase.from('profiles').select('name, upi_vpa').eq('id', event.host_id).maybeSingle(),
    supabase
      .from('event_rsvps')
      .select('id, player_id, guest_name, guest_phone, status, attended, responded_at')
      .eq('event_id', id)
      .order('responded_at', { ascending: true }),
    supabase
      .from('event_costs')
      .select('total_amount_paise, split_mode, notes')
      .eq('event_id', id)
      .maybeSingle(),
    supabase
      .from('event_cost_assignments')
      .select('id, player_id, amount_paise, paid')
      .eq('event_id', id),
  ]);

  const rsvps = (rsvpsRaw ?? []) as RsvpRow[];

  // Resolve player names for any RSVPs that point to a profile.
  const playerIds = Array.from(new Set([
    ...rsvps.map(r => r.player_id).filter((x): x is string => !!x),
    ...((assignmentsRaw ?? []).map(a => a.player_id)),
  ]));
  const { data: profileRows } = playerIds.length > 0
    ? await supabase.from('profiles').select('id, name').in('id', playerIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const nameById = new Map((profileRows ?? []).map(p => [p.id, p.name]));

  const myRsvp = user ? rsvps.find(r => r.player_id === user.id) : null;
  const goingRsvps = rsvps.filter(r => r.status === 'going');
  const goingCount = goingRsvps.length;

  // Strip guest_phone from non-host views (RLS allows the read of all rows
  // because the public going-list is the point; we redact PII at the
  // application layer here).
  const visibleRsvps = rsvps.map(r => ({
    id: r.id,
    name: r.player_id
      ? (nameById.get(r.player_id) ?? 'Unknown')
      : (r.guest_name ?? 'Guest'),
    isGuest: !r.player_id,
    isMe: !!user && r.player_id === user.id,
    status: r.status,
    phone: isHost ? r.guest_phone : null,
  }));

  const assignments = (assignmentsRaw ?? []).map(a => ({
    id: a.id,
    player_id: a.player_id,
    player_name: nameById.get(a.player_id) ?? 'Unknown',
    amount_paise: a.amount_paise,
    paid: a.paid,
  }));

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">
      <Link href="/events" className="text-xs text-gray-500 hover:text-gray-300 inline-flex items-center gap-1 self-start">
        <ArrowLeft size={12} /> Events
      </Link>

      <header className="bg-gradient-to-br from-emerald-900/30 to-gray-900 border border-emerald-900/40 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <span className="text-3xl shrink-0">{SPORT_EMOJI[event.sport] ?? '🎯'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white leading-tight">{event.name}</h1>
              <StatusBadge status={event.status} />
              {event.recruiting && event.status === 'open' && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider bg-orange-950/60 text-orange-300 px-1.5 py-0.5 rounded">
                  <Flame size={10} />
                  {event.capacity != null
                    ? `Needs ${Math.max(0, event.capacity - goingCount)}`
                    : 'Looking for players'}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1 capitalize flex items-center gap-1">
              <CalendarDays size={12} /> {event.sport.replace('_', ' ')} · {formatEventDateTime(event.start_at)}
            </p>
            {event.venue_name && (
              <p className="text-xs text-gray-300 mt-1 flex items-center gap-1">
                <MapPin size={12} className="text-gray-500" />
                <a
                  href={event.venue_map_url || googleMapsSearchUrl(event.venue_name)}
                  target="_blank" rel="noopener noreferrer"
                  className="hover:text-emerald-400 underline-offset-2 hover:underline"
                >
                  {event.venue_name}
                </a>
              </p>
            )}
            <p className="text-xs text-gray-500 mt-2">
              Hosted by <span className="text-gray-300">{hostProfile?.name ?? 'Unknown'}</span>
              {event.capacity ? ` · ${goingCount}/${event.capacity} confirmed` : ` · ${goingCount} confirmed`}
            </p>
            {event.description && (
              <p className="text-sm text-gray-300 mt-3 whitespace-pre-line">{event.description}</p>
            )}
          </div>
        </div>
      </header>

      {/* Host-only edit / cancel / delete controls */}
      {isHost && (
        <HostControls
          eventId={event.id}
          eventName={event.name}
          status={event.status}
        />
      )}

      {/* RSVP actions: signed-in path or guest form */}
      {event.status === 'cancelled' ? (
        <p className="bg-red-950/30 border border-red-900/60 rounded-xl px-3 py-2 text-sm text-red-200">
          This event was cancelled.{event.cancellation_reason ? ` Reason: ${event.cancellation_reason}` : ''}
        </p>
      ) : user ? (
        <EventActions
          eventId={event.id}
          eventName={event.name}
          sport={event.sport}
          startAtISO={event.start_at}
          venueName={event.venue_name}
          goingCount={goingCount}
          capacity={event.capacity}
          myStatus={myRsvp?.status ?? null}
          signedIn={true}
          isHost={isHost}
        />
      ) : (
        <>
          <EventActions
            eventId={event.id}
            eventName={event.name}
            sport={event.sport}
            startAtISO={event.start_at}
            venueName={event.venue_name}
            goingCount={goingCount}
            capacity={event.capacity}
            myStatus={null}
            signedIn={false}
            isHost={false}
          />
          <GuestRsvpForm eventId={event.id} />
        </>
      )}

      {/* Going / Maybe / Can't / Waitlist lists */}
      <RsvpList
        title="Going" icon={Users} tone="emerald"
        rows={visibleRsvps.filter(r => r.status === 'going')}
        capacity={event.capacity}
        isHost={isHost}
      />
      {visibleRsvps.some(r => r.status === 'maybe') && (
        <RsvpList
          title="Maybe" icon={Hourglass} tone="amber"
          rows={visibleRsvps.filter(r => r.status === 'maybe')}
          capacity={null}
          isHost={isHost}
        />
      )}
      {visibleRsvps.some(r => r.status === 'not_going') && (
        <RsvpList
          title="Can't make it" icon={XIcon} tone="red"
          rows={visibleRsvps.filter(r => r.status === 'not_going')}
          capacity={null}
          isHost={isHost}
        />
      )}
      {visibleRsvps.some(r => r.status === 'waitlist') && (
        <RsvpList
          title="Waitlist" icon={Hourglass} tone="gray"
          rows={visibleRsvps.filter(r => r.status === 'waitlist')}
          capacity={null}
          isHost={isHost}
        />
      )}

      {/* Cost split — participants come from match_players, not RSVPs */}
      <CostSplitSection
        eventId={event.id}
        eventName={event.name}
        isHost={isHost}
        currentUserId={user?.id ?? null}
        cost={costRow ?? null}
        assignments={assignments}
        hostUpiVpa={(hostProfile as { upi_vpa?: string | null } | null)?.upi_vpa ?? null}
        hostName={hostProfile?.name ?? null}
      />

      {/* Matches + per-event leaderboard */}
      <EventMatchesSection
        eventId={event.id}
        sport={event.sport as SportType}
        isHost={isHost}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'open'      ? 'bg-emerald-500/15 text-emerald-300' :
    status === 'closed'    ? 'bg-gray-800 text-gray-400' :
    status === 'completed' ? 'bg-gray-800 text-gray-400' :
                             'bg-red-950/60 text-red-300';
  return (
    <span className={`text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded ${tone}`}>
      {status}
    </span>
  );
}

function RsvpList({
  title, icon: Icon, tone, rows, capacity, isHost,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: 'emerald' | 'amber' | 'gray' | 'red';
  rows: { id: string; name: string; isGuest: boolean; isMe: boolean; status: string; phone: string | null }[];
  capacity: number | null;
  isHost: boolean;
}) {
  const toneCls: Record<string, string> = {
    emerald: 'text-emerald-400',
    amber:   'text-amber-400',
    red:     'text-red-400',
    gray:    'text-gray-400',
  };
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2">
          <Icon size={14} className={toneCls[tone]} />
          {title} <span className="text-gray-500 font-normal">({rows.length}{capacity ? ` / ${capacity}` : ''})</span>
        </h2>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500 italic">No one yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map(r => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-sm py-1">
              <span className="truncate">
                <span className={r.isMe ? 'text-emerald-300 font-semibold' : 'text-gray-200'}>{r.name}</span>
                {r.isGuest && <span className="text-[10px] text-gray-600 ml-1.5 uppercase tracking-wider">guest</span>}
                {r.isMe && <span className="text-[10px] text-gray-600 ml-1">(you)</span>}
                {isHost && r.phone && <span className="text-[10px] text-gray-600 ml-2 font-mono">{r.phone}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
