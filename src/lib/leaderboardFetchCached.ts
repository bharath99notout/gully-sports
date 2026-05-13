import 'server-only';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { CACHE_TAG_LEADERBOARD } from '@/lib/cache/tags';
import type { SportKey } from '@/lib/caliber';

/** Rows returned by the global leaderboard stats query (matches embed). */
export interface LeaderboardRawStat {
  player_id: string;
  sport: SportKey;
  runs_scored: number | null;
  wickets_taken: number | null;
  catches_taken: number | null;
  goals_scored: number | null;
  match_id: string;
  profiles: { id: string; name: string; avatar_url: string | null } | null;
  matches: {
    winner_team_id: string | null;
    winner_team_name: string | null;
    team_a_id: string | null;
    team_b_id: string | null;
    team_a_name: string;
    team_b_name: string;
    confirmation_state?: string | null;
  } | null;
}

export interface LeaderboardMatchPlayerRow {
  match_id: string;
  player_id: string;
  team_name: string;
}

export interface LeaderboardMatchScoreRow {
  match_id: string;
  team_name: string;
  sets: number[] | null;
}

export interface LeaderboardSnapshot {
  stats: LeaderboardRawStat[];
  matchPlayers: LeaderboardMatchPlayerRow[];
  matchScores: LeaderboardMatchScoreRow[];
}

const STATS_SELECT = `
  player_id, sport, runs_scored, wickets_taken, catches_taken, goals_scored, match_id,
  profiles(id, name, avatar_url),
  matches(winner_team_id, winner_team_name, team_a_id, team_b_id, team_a_name, team_b_name, confirmation_state)
`;

async function fetchLeaderboardSnapshotUncached(): Promise<LeaderboardSnapshot> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('player_match_stats')
    .select(STATS_SELECT)
    .returns<LeaderboardRawStat[]>();

  if (error) {
    console.warn('[leaderboardFetchCached]', error.message);
    return { stats: [], matchPlayers: [], matchScores: [] };
  }

  const stats = (data ?? []).filter(r => r.matches?.confirmation_state === 'confirmed');
  const matchIds = Array.from(new Set(stats.map(r => r.match_id)));

  if (matchIds.length === 0) {
    return { stats, matchPlayers: [], matchScores: [] };
  }

  const [{ data: mp }, { data: ms }] = await Promise.all([
    admin
      .from('match_players')
      .select('match_id, player_id, team_name')
      .in('match_id', matchIds),
    admin
      .from('match_scores')
      .select('match_id, team_name, sets')
      .in('match_id', matchIds)
      .returns<LeaderboardMatchScoreRow[]>(),
  ]);

  return {
    stats,
    matchPlayers: (mp ?? []) as LeaderboardMatchPlayerRow[],
    matchScores: (ms ?? []) as LeaderboardMatchScoreRow[],
  };
}

/**
 * Cached global leaderboard source data (Next.js Data Cache + service role).
 * Same confirmed-match filter as `/leaderboard` used with the user-scoped
 * client — admin bypasses RLS but we only aggregate public stat rows.
 *
 * Invalidate via `revalidateCacheTag(CACHE_TAG_LEADERBOARD)` from server actions
 * when matches / confirmations change.
 */
export async function getLeaderboardSnapshotCached(): Promise<LeaderboardSnapshot> {
  return unstable_cache(fetchLeaderboardSnapshotUncached, ['global-leaderboard-snapshot-v1'], {
    revalidate: 60,
    tags: [CACHE_TAG_LEADERBOARD],
  })();
}
