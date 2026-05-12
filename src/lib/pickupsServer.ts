import { createClient } from './supabase/server';
import type {
  PickupRequest, PickupResponse, PickupRequestWithMeta, SportType,
} from '@/types';

/**
 * Server-side queries for the "Need Players Now" feature.
 *
 * Hot paths (dashboard rail, list page) call `getNearbyPickups` with the
 * viewer's GPS coords; cold paths (my-pickups list, detail page) just take
 * IDs.
 *
 * All readers run `pickup_expire_stale()` first — cheap UPDATE on the
 * partial open-status index — to avoid surfacing pings whose `expires_at`
 * has already passed. Saves us a pg_cron job.
 */

/** Include pickups starting up to this many days ahead (calendar scheduling). */
const PICKUP_START_MAX_DAYS_AHEAD = 14;
/** Still show pickups that “just started” within this many minutes. */
const PICKUP_START_PAST_GRACE_MIN = 30;

// ── Internal helpers ─────────────────────────────────────────────────────────

async function sweepExpired() {
  const supabase = await createClient();
  // ignore errors — a stale sweep is best-effort
  await supabase.rpc('pickup_expire_stale').then(() => {}, () => {});
}

interface HostJoinRow {
  id: string;
  name: string | null;
  avatar_url: string | null;
}

interface PickupRowFromDB extends PickupRequest {
  host: HostJoinRow | HostJoinRow[] | null;
  pickup_responses?: Array<{ status: PickupResponse['status']; joiner_id: string }>;
}

function decorate(
  row: PickupRowFromDB,
  viewerId: string | null,
  viewerLat: number | null,
  viewerLng: number | null,
): PickupRequestWithMeta {
  // Supabase returns the joined profile as either a single object or an
  // array depending on FK direction; normalize to a single record.
  const hostRaw = Array.isArray(row.host) ? row.host[0] : row.host;
  const host = hostRaw
    ? { id: hostRaw.id, name: hostRaw.name ?? 'Player', avatar_url: hostRaw.avatar_url ?? null }
    : { id: row.host_id, name: 'Player', avatar_url: null };

  const responses = row.pickup_responses ?? [];
  const accepted_count = responses.filter(r => r.status === 'accepted').length;

  let distance_km: number | null = null;
  if (viewerLat != null && viewerLng != null) {
    distance_km = haversineKm(viewerLat, viewerLng, row.ground_lat, row.ground_lng);
  }

  const viewer_response = viewerId
    ? (responses.find(r => r.joiner_id === viewerId) as PickupResponse | undefined) ?? null
    : null;

  return {
    ...row,
    host,
    accepted_count,
    distance_km,
    viewer_response: viewer_response as PickupResponse | null,
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

const PICKUP_SELECT = `
  id, host_id, sport, ground_name, ground_lat, ground_lng,
  slots_total, format, notes, start_time, expires_at, status,
  match_id, created_at,
  host:profiles!pickup_requests_host_id_fkey(id, name, avatar_url),
  pickup_responses(joiner_id, status)
`;

// ── Public reads ─────────────────────────────────────────────────────────────

/**
 * Open pickups within a radius of (lat,lng), sorted by start_time.
 * Pass radiusKm=null to get all open pickups regardless of distance (used
 * when viewer hasn't granted location yet).
 *
 * The actual filter is done in JS because we don't depend on PostGIS — the
 * open-pickup count is small enough (< few hundred at any time) that fetching
 * + filtering in app code is fine.
 */
export async function getNearbyPickups(opts: {
  viewerId: string | null;
  viewerLat: number | null;
  viewerLng: number | null;
  radiusKm: number | null;
  sport?: SportType;
  limit?: number;
}): Promise<PickupRequestWithMeta[]> {
  await sweepExpired();
  const supabase = await createClient();

  const horizon = new Date(
    Date.now() + PICKUP_START_MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000,
  ).toISOString();
  const pastGrace = new Date(
    Date.now() - PICKUP_START_PAST_GRACE_MIN * 60 * 1000,
  ).toISOString();

  let q = supabase
    .from('pickup_requests')
    .select(PICKUP_SELECT)
    .eq('status', 'open')
    .gte('start_time', pastGrace)
    .lte('start_time', horizon)
    .order('start_time', { ascending: true });
  if (opts.sport) q = q.eq('sport', opts.sport);

  const { data, error } = await q.limit(opts.limit ?? 50);
  if (error || !data) return [];

  const decorated = (data as unknown as PickupRowFromDB[]).map(r =>
    decorate(r, opts.viewerId, opts.viewerLat, opts.viewerLng),
  );

  if (opts.radiusKm != null && opts.viewerLat != null && opts.viewerLng != null) {
    return decorated.filter(p => (p.distance_km ?? Infinity) <= opts.radiusKm!);
  }
  return decorated;
}

export async function getPickupById(
  id: string,
  viewerId: string | null,
  viewerLat: number | null = null,
  viewerLng: number | null = null,
): Promise<PickupRequestWithMeta | null> {
  await sweepExpired();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('pickup_requests')
    .select(PICKUP_SELECT)
    .eq('id', id)
    .single();
  if (error || !data) return null;

  return decorate(data as unknown as PickupRowFromDB, viewerId, viewerLat, viewerLng);
}

/**
 * Returns all responses for a pickup (used on detail page by the host).
 */
export async function getPickupResponses(
  requestId: string,
): Promise<Array<PickupResponse & { joiner: { id: string; name: string; avatar_url: string | null; phone: string | null } }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('pickup_responses')
    .select(`
      id, request_id, joiner_id, status, created_at, decided_at,
      joiner:profiles!pickup_responses_joiner_id_fkey(id, name, avatar_url, phone)
    `)
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];

  type Row = PickupResponse & {
    joiner: { id: string; name: string | null; avatar_url: string | null; phone: string | null }
          | Array<{ id: string; name: string | null; avatar_url: string | null; phone: string | null }>
          | null;
  };
  return (data as unknown as Row[]).map(r => {
    const jraw = Array.isArray(r.joiner) ? r.joiner[0] : r.joiner;
    return {
      ...r,
      joiner: {
        id: jraw?.id ?? r.joiner_id,
        name: jraw?.name ?? 'Player',
        avatar_url: jraw?.avatar_url ?? null,
        phone: jraw?.phone ?? null,
      },
    };
  });
}

/**
 * Pickups I created (any status) + pickups I responded to (any status).
 * Sorted by created_at desc, capped.
 */
export async function getMyPickups(
  userId: string,
  limit = 30,
): Promise<{
  hosted: PickupRequestWithMeta[];
  joined: PickupRequestWithMeta[];
}> {
  await sweepExpired();
  const supabase = await createClient();

  const [hostedRes, joinedRes] = await Promise.all([
    supabase.from('pickup_requests').select(PICKUP_SELECT)
      .eq('host_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase.from('pickup_responses').select(`
      request_id,
      pickup_requests(${PICKUP_SELECT})
    `)
      .eq('joiner_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  const hosted = (hostedRes.data ?? []) as unknown as PickupRowFromDB[];

  // Joined query nests pickup_requests one level down — flatten + dedupe
  // (same request can appear once per response row, though unique-key on
  //  (request_id, joiner_id) means one per user already).
  const joinedRaw = (joinedRes.data ?? []) as unknown as Array<{
    pickup_requests: PickupRowFromDB | PickupRowFromDB[] | null;
  }>;
  const joined: PickupRowFromDB[] = [];
  for (const row of joinedRaw) {
    const r = Array.isArray(row.pickup_requests) ? row.pickup_requests[0] : row.pickup_requests;
    if (r) joined.push(r);
  }

  return {
    hosted: hosted.map(r => decorate(r, userId, null, null)),
    joined: joined.map(r => decorate(r, userId, null, null)),
  };
}

/**
 * Count of matches the viewer and otherUser have both played in.
 * Used on the pickup detail page to give the joiner social proof
 * ("3 mutual matches with the host") before they ask to join.
 *
 * Best-effort: returns 0 on any error.
 */
export async function countMutualMatches(
  viewerId: string,
  otherUserId: string,
): Promise<number> {
  if (viewerId === otherUserId) return 0;
  const supabase = await createClient();

  const [me, them] = await Promise.all([
    supabase.from('match_players').select('match_id').eq('player_id', viewerId),
    supabase.from('match_players').select('match_id').eq('player_id', otherUserId),
  ]);
  if (me.error || them.error) return 0;
  const mineSet = new Set((me.data ?? []).map(r => r.match_id));
  return (them.data ?? []).filter(r => mineSet.has(r.match_id)).length;
}
