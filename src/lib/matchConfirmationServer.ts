import 'server-only';
import { createClient } from './supabase/server';
import type { SportType } from '@/types';

/**
 * In-memory rate limiter so we don't hammer the DB sweep on every request.
 * The sweep itself is cheap (partial index on auto_confirm_at), but the RPC
 * still adds a roundtrip we don't need more than once per minute.
 */
let lastSweepAt = 0;
const SWEEP_INTERVAL_MS = 60_000; // 60s

/**
 * Promote any 'pending' matches whose auto_confirm_at has elapsed to
 * 'confirmed'. Safe to call on every page load — the rate limiter and DB
 * partial index keep it cheap.
 *
 * Implementation note: until pg_cron is set up, this is the auto-confirm
 * mechanism. We call it from server components that read match lists so it
 * runs naturally as users browse the app.
 */
export async function maybeSweepAutoConfirms(): Promise<void> {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;

  try {
    const supabase = await createClient();
    await supabase.rpc('sweep_auto_confirms');
  } catch (err) {
    // Don't break the page if the sweep fails — just log it. The next
    // request (or pg_cron eventually) will catch up.
    console.warn('[maybeSweepAutoConfirms] sweep failed', err);
  }
}

export interface PendingMatchSummary {
  match_id: string;
  sport: SportType;
  team_a_name: string;
  team_b_name: string;
  played_at: string;
  /** This player's row status — almost always 'pending', but we surface
   *  'disputed' too so they can revisit a stale dispute they raised. */
  my_status: 'pending' | 'disputed';
  match_state: 'pending' | 'disputed' | 'force_pushed';
  auto_confirm_at: string | null;
}

/**
 * Matches that need *this user's* attention: ones where they're a
 * participant and their confirmation row is still 'pending' (or where they
 * disputed but the scorer hasn't responded yet).
 *
 * Used by the dashboard banner and the Navbar badge counter.
 */
export async function getPendingMatchesForUser(userId: string): Promise<PendingMatchSummary[]> {
  const supabase = await createClient();

  // Pull the user's rows where they still owe a response, then enrich with
  // the parent match. Two roundtrips, but each is small and indexed.
  const { data: confs } = await supabase
    .from('match_confirmations')
    .select('match_id, status')
    .eq('player_id', userId)
    .in('status', ['pending', 'disputed']);

  if (!confs?.length) return [];

  const matchIds = confs.map(c => c.match_id);
  const { data: matches } = await supabase
    .from('matches')
    .select('id, sport, team_a_name, team_b_name, played_at, confirmation_state, auto_confirm_at')
    .in('id', matchIds)
    .in('confirmation_state', ['pending', 'disputed', 'force_pushed'])
    .order('played_at', { ascending: false });

  if (!matches?.length) return [];

  const statusByMatch = new Map(confs.map(c => [c.match_id, c.status as 'pending' | 'disputed']));

  return matches.map(m => ({
    match_id: m.id,
    sport: m.sport as SportType,
    team_a_name: m.team_a_name,
    team_b_name: m.team_b_name,
    played_at: m.played_at,
    my_status: statusByMatch.get(m.id) ?? 'pending',
    match_state: m.confirmation_state as 'pending' | 'disputed' | 'force_pushed',
    auto_confirm_at: m.auto_confirm_at,
  }));
}

/**
 * Count of matches sitting in the admin queue. Used by Navbar to show a red
 * badge for admins. Lightweight — head-only count.
 */
export async function getAdminQueueCount(): Promise<number> {
  const supabase = await createClient();
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // Force-pushed always counts; stuck-disputed only past the stale threshold (played_at).
  const [{ count: a }, { count: b }] = await Promise.all([
    supabase.from('matches').select('id', { count: 'exact', head: true })
      .eq('confirmation_state', 'force_pushed'),
    supabase.from('matches').select('id', { count: 'exact', head: true })
      .eq('confirmation_state', 'disputed').lt('played_at', dayAgo),
  ]);
  return (a ?? 0) + (b ?? 0);
}

/** Whether a given user is an admin. Cheap single-row read. */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', userId).single();
  return !!data?.is_admin;
}
