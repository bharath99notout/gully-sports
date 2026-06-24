import 'server-only';
import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerAuth } from '@/lib/supabase/server';
import { getAdminQueueCount } from '@/lib/matchConfirmationServer';
import type {
  AdminAuditEvent,
  AdminMatchRow,
  AdminOverview,
  AdminUserRow,
} from './types';

type AdminProfile = {
  id: string;
  name: string;
  is_admin: boolean;
};

type ProfileRow = {
  id: string;
  name: string | null;
  phone: string | null;
  created_at: string;
  last_seen_at: string | null;
  last_login_at: string | null;
  is_admin: boolean | null;
  reliability_no_shows: number | null;
};

type AuditEventRow = {
  id: string;
  actor_user_id: string | null;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type MatchRow = {
  id: string;
  sport: string;
  status: string;
  confirmation_state: string | null;
  team_a_name: string;
  team_b_name: string;
  created_by: string | null;
  scored_by: string | null;
  created_at: string;
  played_at: string | null;
};

type CountResult = {
  count: number | null;
  error: { message: string } | null;
};

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function readCount(label: string, query: PromiseLike<CountResult>): Promise<number> {
  const { count, error } = await query;
  if (error) {
    console.warn(`[admin] count failed for ${label}`, error.message);
    return 0;
  }
  return count ?? 0;
}

export async function requireAdmin() {
  const { supabase, user } = await getServerAuth();
  if (!user) notFound();

  const { data } = await supabase
    .from('profiles')
    .select('id, name, is_admin')
    .eq('id', user.id)
    .single();

  const profile = data as AdminProfile | null;
  if (!profile?.is_admin) notFound();
  return { supabase, user, profile };
}

async function loadNames(
  supabase: SupabaseClient,
  userIds: Array<string | null | undefined>,
) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map<string, { name: string; phone: string | null }>();

  const { data } = await supabase
    .from('profiles')
    .select('id, name, phone')
    .in('id', ids);

  return new Map(
    ((data ?? []) as Array<{ id: string; name: string | null; phone: string | null }>)
      .map(p => [p.id, { name: p.name?.trim() || 'Unnamed', phone: p.phone }]),
  );
}

export async function getAdminAuditEvents(
  supabase: SupabaseClient,
  limit = 50,
): Promise<AdminAuditEvent[]> {
  const { data, error } = await supabase
    .from('audit_events')
    .select('id, actor_user_id, event_type, entity_type, entity_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[admin] audit read failed', error.message);
    return [];
  }

  const rows = (data ?? []) as AuditEventRow[];
  const names = await loadNames(supabase, rows.map(r => r.actor_user_id));

  return rows.map(r => {
    const actor = r.actor_user_id ? names.get(r.actor_user_id) : null;
    return {
      id: r.id,
      actor_user_id: r.actor_user_id,
      actor_name: actor?.name ?? 'System',
      actor_phone: actor?.phone ?? null,
      event_type: r.event_type,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      metadata: r.metadata ?? {},
      created_at: r.created_at,
    };
  });
}

export async function getAdminRecentMatches(
  supabase: SupabaseClient,
  limit = 50,
): Promise<AdminMatchRow[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('id, sport, status, confirmation_state, team_a_name, team_b_name, created_by, scored_by, created_at, played_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[admin] recent matches failed', error.message);
    return [];
  }

  const rows = (data ?? []) as MatchRow[];
  const matchIds = rows.map(m => m.id);
  const [names, { data: playerRows }] = await Promise.all([
    loadNames(supabase, rows.flatMap(m => [m.created_by, m.scored_by])),
    matchIds.length
      ? supabase.from('match_players').select('match_id').in('match_id', matchIds)
      : Promise.resolve({ data: [] as Array<{ match_id: string }> }),
  ]);

  const playerCountByMatch = new Map<string, number>();
  for (const row of (playerRows ?? []) as Array<{ match_id: string }>) {
    playerCountByMatch.set(row.match_id, (playerCountByMatch.get(row.match_id) ?? 0) + 1);
  }

  return rows.map(m => {
    const creator = m.created_by ? names.get(m.created_by) : null;
    const scorerId = m.scored_by ?? m.created_by;
    const scorer = scorerId ? names.get(scorerId) : null;
    return {
      id: m.id,
      sport: m.sport,
      status: m.status,
      confirmation_state: m.confirmation_state,
      team_a_name: m.team_a_name,
      team_b_name: m.team_b_name,
      created_by: m.created_by,
      creator_name: creator?.name ?? 'Unknown',
      scored_by: m.scored_by,
      scorer_name: scorer?.name ?? 'Unknown',
      player_count: playerCountByMatch.get(m.id) ?? 0,
      created_at: m.created_at,
      played_at: m.played_at,
    };
  });
}

export async function getAdminUsers(
  supabase: SupabaseClient,
  limit = 50,
): Promise<AdminUserRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, phone, created_at, last_seen_at, last_login_at, is_admin, reliability_no_shows')
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[admin] users read failed', error.message);
    return [];
  }

  const profiles = (data ?? []) as ProfileRow[];
  const ids = profiles.map(p => p.id);
  const [{ data: playedRows }, { data: createdRows }] = await Promise.all([
    ids.length ? supabase.from('match_players').select('player_id').in('player_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from('matches').select('created_by').in('created_by', ids) : Promise.resolve({ data: [] }),
  ]);

  const playedByUser = new Map<string, number>();
  for (const r of (playedRows ?? []) as Array<{ player_id: string }>) {
    playedByUser.set(r.player_id, (playedByUser.get(r.player_id) ?? 0) + 1);
  }

  const createdByUser = new Map<string, number>();
  for (const r of (createdRows ?? []) as Array<{ created_by: string }>) {
    createdByUser.set(r.created_by, (createdByUser.get(r.created_by) ?? 0) + 1);
  }

  return profiles.map(p => ({
    id: p.id,
    name: p.name?.trim() || 'Unnamed',
    phone: p.phone,
    created_at: p.created_at,
    last_seen_at: p.last_seen_at,
    last_login_at: p.last_login_at,
    is_admin: !!p.is_admin,
    reliability_no_shows: p.reliability_no_shows ?? 0,
    matches_played: playedByUser.get(p.id) ?? 0,
    matches_created: createdByUser.get(p.id) ?? 0,
  }));
}

export async function getAdminOverview(supabase: SupabaseClient): Promise<AdminOverview> {
  const todayIso = startOfTodayIso();
  const [
    totalUsers,
    activeToday,
    loginsToday,
    matchesCreatedToday,
    matchesCompletedToday,
    eventsCreatedToday,
    pickupsCreatedToday,
    adminQueueCount,
    recentAudit,
    recentMatches,
  ] = await Promise.all([
    readCount('profiles', supabase.from('profiles').select('id', { count: 'exact', head: true })),
    readCount('profiles.active_today', supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('last_seen_at', todayIso)),
    readCount('user_sessions.today', supabase.from('user_sessions').select('id', { count: 'exact', head: true }).gte('created_at', todayIso)),
    readCount('matches.created_today', supabase.from('matches').select('id', { count: 'exact', head: true }).gte('created_at', todayIso)),
    readCount('matches.completed_today', supabase.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('played_at', todayIso)),
    readCount('events.created_today', supabase.from('events').select('id', { count: 'exact', head: true }).gte('created_at', todayIso)),
    readCount('pickups.created_today', supabase.from('pickup_requests').select('id', { count: 'exact', head: true }).gte('created_at', todayIso)),
    getAdminQueueCount(),
    getAdminAuditEvents(supabase, 8),
    getAdminRecentMatches(supabase, 8),
  ]);

  return {
    totalUsers,
    activeToday,
    loginsToday,
    matchesCreatedToday,
    matchesCompletedToday,
    eventsCreatedToday,
    pickupsCreatedToday,
    adminQueueCount,
    recentAudit,
    recentMatches,
  };
}
