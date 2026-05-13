import Link from 'next/link';
import { CalendarDays, MapPin, Plus, Users, Flame } from 'lucide-react';
import { listEvents, type EventListRow, type ListEventsOpts } from '@/lib/eventsServer';
import { getServerAuth } from '@/lib/supabase/server';
import { formatEventDateTime } from '@/lib/formatDateTime';
import SportIcon from '@/components/SportIcon';
import type { SportType } from '@/types';

const SPORT_LABEL: Record<SportType, string> = {
  cricket: 'Cricket', football: 'Football', badminton: 'Badminton', table_tennis: 'TT', foosball: 'Foosball',
};

const SPORTS: SportType[] = ['cricket', 'football', 'badminton', 'table_tennis', 'foosball'];


type SearchParams = {
  sport?: string;
  when?: string;
  recruiting?: string;
  scope?: string;
};

function parseFilters(sp: SearchParams): {
  sport?: SportType;
  when: 'upcoming' | 'past';
  recruiting: boolean;
  scope: 'all' | 'mine';
} {
  const sport = (SPORTS as string[]).includes(sp.sport ?? '') ? (sp.sport as SportType) : undefined;
  const when = sp.when === 'past' ? 'past' : 'upcoming';
  const recruiting = sp.recruiting === '1';
  const scope: 'all' | 'mine' =
    sp.scope === 'mine' ? 'mine' :
    sp.scope === 'all'  ? 'all'  :
    when === 'past' ? 'mine' : 'all';
  return { sport, when, recruiting, scope };
}

function buildHref(base: SearchParams, override: Partial<SearchParams>): string {
  const merged = { ...base, ...override };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/events?${qs}` : '/events';
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { sport, when, recruiting, scope } = parseFilters(sp);

  const opts: ListEventsOpts = { sport, when, recruiting, scope, limit: 50 };
  const { user } = await getServerAuth();
  const events = await listEvents(opts);

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <CalendarDays size={20} className="text-emerald-400" /> Events
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Plan a session, find players, split the cost.
          </p>
        </div>
        {user && (
          <Link
            href="/events/new"
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-3 py-2 rounded-xl"
          >
            <Plus size={14} /> New event
          </Link>
        )}
      </header>

      {/* Upcoming / Past tabs */}
      <div className="grid grid-cols-2 bg-gray-900 border border-gray-800 rounded-xl p-1 text-sm font-medium">
        <Link
          href={buildHref(sp, { when: undefined, scope: undefined })}
          className={`text-center py-2 rounded-lg transition-colors ${
            when === 'upcoming' ? 'bg-emerald-900/40 text-emerald-300' : 'text-gray-400 hover:text-white'
          }`}
        >
          Upcoming
        </Link>
        <Link
          href={buildHref(sp, { when: 'past', scope: undefined })}
          className={`text-center py-2 rounded-lg transition-colors ${
            when === 'past' ? 'bg-emerald-900/40 text-emerald-300' : 'text-gray-400 hover:text-white'
          }`}
        >
          Past {when === 'past' && scope === 'mine' && <span className="text-[10px] text-gray-500">(mine)</span>}
        </Link>
      </div>

      {/* Sport tabs */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={buildHref(sp, { sport: undefined })}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            !sport ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-600'
          }`}
        >
          All sports
        </Link>
        {SPORTS.map(s => (
          <Link
            key={s}
            href={buildHref(sp, { sport: s })}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              sport === s ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            <SportIcon sport={s} className="mr-1" /> {SPORT_LABEL[s]}
          </Link>
        ))}
      </div>

      {/* Recruiting + Scope chips (only meaningful for upcoming) */}
      {when === 'upcoming' && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildHref(sp, { recruiting: recruiting ? undefined : '1' })}
            className={`inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-colors ${
              recruiting
                ? 'bg-orange-900/40 border-orange-700 text-orange-300'
                : 'border-gray-700 text-gray-400 hover:border-orange-700 hover:text-orange-300'
            }`}
          >
            <Flame size={12} /> Looking for players
          </Link>
          {user && (
            <Link
              href={buildHref(sp, { scope: scope === 'mine' ? undefined : 'mine' })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                scope === 'mine'
                  ? 'bg-emerald-900/40 border-emerald-700 text-emerald-300'
                  : 'border-gray-700 text-gray-400 hover:border-emerald-700 hover:text-emerald-300'
              }`}
            >
              My events only
            </Link>
          )}
        </div>
      )}

      {/* List */}
      {events.length === 0 ? (
        <EmptyState when={when} recruiting={recruiting} sport={sport} scope={scope} />
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map(e => <EventRow key={e.id} event={e} />)}
        </ul>
      )}
    </div>
  );
}

function EventRow({ event: e }: { event: EventListRow }) {
  const slotsLeft = e.capacity != null ? Math.max(0, e.capacity - e.going_count) : null;
  const showRecruitingPill = e.recruiting && e.status === 'open';

  return (
    <li>
      <Link
        href={`/events/${e.id}`}
        className={`block bg-gray-900 hover:bg-gray-800/80 border border-gray-800 rounded-2xl p-4 transition-colors ${
          e.status === 'cancelled' ? 'opacity-60' : ''
        }`}
      >
        <div className="flex items-start gap-3">
          <SportIcon sport={e.sport} className="text-2xl shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white truncate">{e.name}</h3>
              {e.status === 'cancelled' && (
                <span className="text-[10px] uppercase font-semibold tracking-wider bg-red-950/60 text-red-300 px-1.5 py-0.5 rounded">
                  Cancelled
                </span>
              )}
              {showRecruitingPill && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider bg-orange-950/60 text-orange-300 px-1.5 py-0.5 rounded">
                  <Flame size={10} />
                  {slotsLeft != null && slotsLeft > 0 ? `Needs ${slotsLeft}` : 'Looking for players'}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1 capitalize">
              {e.sport.replace('_', ' ')} · {formatEventDateTime(e.start_at)}
            </p>
            {e.venue_name && (
              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                <MapPin size={11} />
                <span className="truncate">{e.venue_name}</span>
              </p>
            )}
            {e.capacity != null && (
              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                <Users size={11} />
                {e.going_count}/{e.capacity} going
              </p>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

function EmptyState({
  when, recruiting, sport, scope,
}: {
  when: 'upcoming' | 'past';
  recruiting: boolean;
  sport?: SportType;
  scope: 'all' | 'mine';
}) {
  let msg = 'No events match these filters.';
  if (when === 'upcoming' && recruiting) {
    msg = sport
      ? `Nobody's looking for ${SPORT_LABEL[sport]} players right now.`
      : 'No-one is recruiting players right now. Be the first — create an event and toggle "Looking for players".';
  } else if (when === 'past' && scope === 'mine') {
    msg = 'You haven\'t hosted or RSVPd to any past events yet.';
  } else if (when === 'upcoming') {
    msg = 'No upcoming events. Create one to get started.';
  }
  return (
    <p className="text-sm text-gray-500 bg-gray-900 border border-dashed border-gray-800 rounded-2xl p-6 text-center">
      {msg}
    </p>
  );
}
