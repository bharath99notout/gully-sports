import 'server-only';
import { createClient } from './supabase/server';
import type { SportEvent, SportType } from '@/types';

export type EventListRow = Pick<
  SportEvent,
  'id' | 'name' | 'sport' | 'start_at' | 'venue_name' | 'capacity' |
  'invite_only' | 'recruiting' | 'status' | 'host_id'
> & {
  /** Count of confirmed-going RSVPs. Used to compute spots remaining. */
  going_count: number;
};

export interface ListEventsOpts {
  sport?: SportType;
  /** Time window. `upcoming` = start_at >= now; `past` = start_at < now. Default 'upcoming'. */
  when?: 'upcoming' | 'past';
  /** Only return events with recruiting=true (host actively wants players). */
  recruiting?: boolean;
  /**
   * `all` = global feed (default for `upcoming`).
   * `mine` = events the current user hosts or has RSVPd to. Default for `past`
   * to stop the list ballooning with everyone-else's history.
   */
  scope?: 'all' | 'mine';
  limit?: number;
}

/**
 * Events feed query. Returns events ordered by start_at, plus a `going_count`
 * so the UI can render "needs N more players" without a second round-trip.
 *
 * The `going_count` is computed via a Postgres aggregate subselect, embedded
 * in PostgREST's relational select syntax (`event_rsvps(count)`). RLS still
 * applies to the embedded read.
 */
export async function listEvents(opts: ListEventsOpts = {}): Promise<EventListRow[]> {
  const supabase = await createClient();
  const when = opts.when ?? 'upcoming';
  const scope = opts.scope ?? (when === 'past' ? 'mine' : 'all');
  const limit = opts.limit ?? 50;
  const nowIso = new Date().toISOString();

  // Resolve "mine" scope to event IDs the current user touches.
  // Doing this client-side keeps the main query simple and lets us short-circuit
  // when the user has zero events.
  let myEventIds: string[] | null = null;
  if (scope === 'mine') {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const [hostRes, rsvpRes] = await Promise.all([
      supabase.from('events').select('id').eq('host_id', user.id),
      supabase.from('event_rsvps').select('event_id').eq('player_id', user.id),
    ]);

    const hostIds = (hostRes.data ?? []).map((r: { id: string }) => r.id);
    const rsvpIds = (rsvpRes.data ?? []).map((r: { event_id: string }) => r.event_id);
    myEventIds = [...new Set([...hostIds, ...rsvpIds])];
    if (myEventIds.length === 0) return [];
  }

  // Ordering: most-recently-created first (created_at DESC). A captain who
  // just made a new event expects to see it at the top of the feed; the
  // earlier "soonest start_at" sort buried fresh creations under whatever
  // happens to start sooner. Past tab keeps the same direction so people
  // see "what was created most recently in the past" — easier to find a
  // game from last weekend than to scroll years deep by start_at.
  let query = supabase
    .from('events')
    .select(`
      id, name, sport, start_at, venue_name, capacity,
      invite_only, recruiting, status, host_id
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (when === 'upcoming') {
    query = query.gte('start_at', nowIso).neq('status', 'cancelled');
  } else {
    query = query.lt('start_at', nowIso);
  }

  if (opts.sport) query = query.eq('sport', opts.sport);
  if (opts.recruiting) query = query.eq('recruiting', true).eq('status', 'open');
  if (myEventIds) query = query.in('id', myEventIds);

  const { data, error } = await query;
  if (error) {
    console.warn('[listEvents]', error.message);
    return [];
  }

  const events = (data ?? []) as Omit<EventListRow, 'going_count'>[];
  if (events.length === 0) return [];

  // Going-counts in a single batch fetch. Cheaper than N+1; one indexed scan
  // on (event_id, status) covers all the events we just read.
  const { data: rsvpRows } = await supabase
    .from('event_rsvps')
    .select('event_id')
    .eq('status', 'going')
    .in('event_id', events.map(e => e.id));

  const goingByEvent = new Map<string, number>();
  for (const r of (rsvpRows ?? []) as { event_id: string }[]) {
    goingByEvent.set(r.event_id, (goingByEvent.get(r.event_id) ?? 0) + 1);
  }

  return events.map(e => ({ ...e, going_count: goingByEvent.get(e.id) ?? 0 }));
}

export async function getEvent(id: string): Promise<SportEvent | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return (data as SportEvent | null) ?? null;
}
