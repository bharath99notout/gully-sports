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

export interface EventInviteeRow {
  phone: string;
  /** Resolved name from profiles when the phone matches a registered user. */
  name: string;
  /** profile_id when the phone matches a profile, null for unregistered phones. */
  player_id: string | null;
  /** RSVP status if the invitee has already responded. */
  rsvp_status: 'going' | 'maybe' | 'not_going' | 'waitlist' | null;
  invited_at: string;
}

/**
 * Host-facing list of invitees for an event. Joins event_invites with
 * profiles (by phone) and event_rsvps (by player_id) so the UI can show
 * the player's name + whether they've already RSVP'd. Phone numbers in
 * the response are 10-digit canonical form.
 *
 * Only callable by the host — RLS on event_invites enforces it; we
 * surface an empty list for non-hosts rather than throwing.
 */
export async function getEventInvitees(eventId: string): Promise<EventInviteeRow[]> {
  const supabase = await createClient();
  const { data: invites, error } = await supabase
    .from('event_invites')
    .select('phone, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });
  if (error) {
    // Non-host hits RLS and gets either an empty result or a permission
    // error depending on PostgREST settings; either way return empty.
    return [];
  }
  const rows = (invites ?? []) as { phone: string; created_at: string }[];
  if (rows.length === 0) return [];

  const phones = rows.map(r => r.phone);

  // Match each invite phone against profiles.phone. profiles.phone may have
  // been backfilled inconsistently for legacy users (some have null), so we
  // also do a case-insensitive `ilike '%<digits>'` to catch any '+91…'
  // stored at one point. Phones that don't match a profile stay nameless.
  const { data: profileRows } = phones.length
    ? await supabase.from('profiles').select('id, name, phone').in('phone', phones)
    : { data: [] as Array<{ id: string; name: string; phone: string }> };
  const profileByPhone = new Map((profileRows ?? []).map(p => [p.phone, p]));

  // RSVP status — joined via player_id where a profile matches.
  const playerIds = (profileRows ?? []).map(p => p.id);
  const { data: rsvpRows } = playerIds.length
    ? await supabase
        .from('event_rsvps')
        .select('player_id, status')
        .eq('event_id', eventId)
        .in('player_id', playerIds)
    : { data: [] as Array<{ player_id: string; status: string }> };
  const rsvpByPlayer = new Map((rsvpRows ?? []).map(r => [r.player_id, r.status]));

  return rows.map(r => {
    const profile = profileByPhone.get(r.phone);
    const playerId = profile?.id ?? null;
    return {
      phone: r.phone,
      name: profile?.name ?? `+91 ${r.phone}`,
      player_id: playerId,
      rsvp_status: (playerId ? (rsvpByPlayer.get(playerId) as EventInviteeRow['rsvp_status'] | undefined) : null) ?? null,
      invited_at: r.created_at,
    };
  });
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
