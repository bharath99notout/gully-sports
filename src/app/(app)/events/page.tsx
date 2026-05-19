import type { ReactNode } from 'react';
import Link from 'next/link';
import { CalendarDays, MapPin, Plus, Users, Flame, CalendarPlus } from 'lucide-react';
import { listEvents, type EventListRow, type ListEventsOpts } from '@/lib/eventsServer';
import { getServerAuth } from '@/lib/supabase/server';
import { formatEventDateTime } from '@/lib/formatDateTime';
import SportIcon from '@/components/SportIcon';
import type { SportType } from '@/types';
import { SPORTS_LIST, SPORT_VALUES } from '@/lib/sports';

// TT stays short in the chip strip (narrow row) — every other label uses
// SPORTS_LIST.label so additions don't need to update this map.
const SPORT_LABEL: Record<SportType, string> = Object.fromEntries(
  SPORTS_LIST.map(s => [s.value, s.value === 'table_tennis' ? 'TT' : s.label])
) as Record<SportType, string>;

const SPORTS: SportType[] = [...SPORT_VALUES];


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
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <CalendarDays size={20} className="text-emerald-400 shrink-0" /> Events
          </h1>
          <p className="text-sm text-gray-500 mt-1 leading-snug">
            Plan a session, find players, split the cost.
          </p>
        </div>
        {user && (
          <Link
            href="/events/new"
            className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl w-full sm:w-auto shrink-0 shadow-sm shadow-emerald-900/30"
          >
            <Plus size={16} strokeWidth={2.5} /> New event
          </Link>
        )}
      </header>

      {/* Upcoming / Past — compact segmented control */}
      <div className="inline-flex w-full max-w-xs p-0.5 bg-gray-900/90 border border-gray-800 rounded-lg text-xs font-semibold">
        <Link
          href={buildHref(sp, { when: undefined, scope: undefined })}
          className={`flex-1 min-h-[2.75rem] flex flex-col items-center justify-center gap-0 rounded-md transition-colors ${
            when === 'upcoming' ? 'bg-emerald-600/25 text-emerald-300 ring-1 ring-emerald-500/30' : 'text-gray-400 hover:text-white'
          }`}
        >
          Upcoming
        </Link>
        <Link
          href={buildHref(sp, { when: 'past', scope: undefined })}
          className={`flex-1 min-h-[2.75rem] flex flex-col items-center justify-center gap-0 rounded-md transition-colors ${
            when === 'past' ? 'bg-emerald-600/25 text-emerald-300 ring-1 ring-emerald-500/30' : 'text-gray-400 hover:text-white'
          }`}
        >
          <span>Past</span>
          {when === 'past' && scope === 'mine' && (
            <span className="text-[10px] font-normal text-gray-500 leading-none mt-0.5">mine</span>
          )}
        </Link>
      </div>

      {/* Sport filters — single horizontal row (scroll on narrow phones) */}
      <div className="relative -mx-4 sm:mx-0">
        <div
          className="flex gap-2 overflow-x-auto px-4 sm:px-0 pb-1.5 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory touch-pan-x"
          role="toolbar"
          aria-label="Filter by sport"
        >
          <FilterChip
            href={buildHref(sp, { sport: undefined })}
            active={!sport}
            className="snap-start"
          >
            All sports
          </FilterChip>
          {SPORTS.map(s => (
            <FilterChip
              key={s}
              href={buildHref(sp, { sport: s })}
              active={sport === s}
              className="snap-start"
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="text-sm leading-none inline-flex items-center justify-center [&>svg]:size-[1em]">
                  <SportIcon sport={s} />
                </span>
                {SPORT_LABEL[s]}
              </span>
            </FilterChip>
          ))}
        </div>
      </div>

      {/* Recruiting + Scope chips (only meaningful for upcoming) */}
      {when === 'upcoming' && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildHref(sp, { recruiting: recruiting ? undefined : '1' })}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-full border transition-colors ${
              recruiting
                ? 'bg-orange-950/50 border-orange-600/60 text-orange-200'
                : 'border-gray-700 text-gray-400 hover:border-orange-700/80 hover:text-orange-200'
            }`}
          >
            <Flame size={13} className="shrink-0" /> Looking for players
          </Link>
          {user && (
            <Link
              href={buildHref(sp, { scope: scope === 'mine' ? undefined : 'mine' })}
              className={`inline-flex items-center text-xs font-medium px-3 py-2 rounded-full border transition-colors ${
                scope === 'mine'
                  ? 'bg-emerald-950/50 border-emerald-600/50 text-emerald-200'
                  : 'border-gray-700 text-gray-400 hover:border-emerald-700/80 hover:text-emerald-200'
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

function FilterChip({
  href,
  active,
  className = '',
  children,
}: {
  href: string;
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`shrink-0 whitespace-nowrap text-xs font-medium px-3.5 py-2 rounded-full border transition-colors inline-flex items-center justify-center ${className} ${
        active
          ? 'bg-gray-700/90 border-gray-500 text-white shadow-sm shadow-black/20'
          : 'border-gray-700/90 text-gray-400 hover:border-gray-600 hover:text-gray-200 bg-gray-950/40'
      }`}
    >
      {children}
    </Link>
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
    <div className="rounded-2xl border border-gray-800 bg-gradient-to-b from-gray-900/90 to-gray-950/90 p-8 text-center ring-1 ring-white/[0.04]">
      <div
        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-950/40 text-emerald-400 ring-1 ring-emerald-500/20"
        aria-hidden
      >
        <CalendarPlus size={22} strokeWidth={1.75} />
      </div>
      <p className="text-sm text-gray-400 leading-relaxed max-w-sm mx-auto">{msg}</p>
    </div>
  );
}
