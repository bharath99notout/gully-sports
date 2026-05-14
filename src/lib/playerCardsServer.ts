import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildAthleteData,
  enrichStatsWithTeamNames,
  type RawStat,
} from '@/lib/athleteData';
import { getTrustScoresForPlayers } from '@/lib/trustScoreServer';
import {
  normalizePlayersPage,
  PLAYERS_PAGE_SIZE,
  type PlayerCardPage,
} from './playerCards';

type ProfileRow = {
  id: string;
  name: string;
  avatar_url: string | null;
  created_at: string;
};

type MatchMeta = {
  id: string;
  winner_team_id: string | null;
  winner_team_name: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  team_a_name: string | null;
  team_b_name: string | null;
  confirmation_state: string | null;
};

type FlatPlayerStat = {
  player_id: string;
  sport: string;
  runs_scored: number | null;
  wickets_taken: number | null;
  catches_taken: number | null;
  goals_scored: number | null;
  match_id: string;
};

export async function getPlayerCardPage({
  supabase,
  page,
  pageSize = PLAYERS_PAGE_SIZE,
}: {
  supabase: SupabaseClient;
  page?: number | string | null;
  pageSize?: number;
}): Promise<PlayerCardPage> {
  const currentPage = normalizePlayersPage(page);
  const safePageSize = Math.min(Math.max(pageSize, 1), 50);
  const from = (currentPage - 1) * safePageSize;
  const to = from + safePageSize;

  const { data: profileRows, error: profilesError } = await supabase
    .from('profiles')
    .select('id, name, avatar_url, created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);

  if (profilesError) {
    console.warn('[playerCards] profiles read failed', profilesError.message);
  }

  const profiles = ((profileRows ?? []) as ProfileRow[]);
  const players = profiles.slice(0, safePageSize);
  const hasMore = profiles.length > safePageSize;
  const playerIds = players.map(p => p.id);

  if (playerIds.length === 0) {
    return {
      items: [],
      page: currentPage,
      pageSize: safePageSize,
      hasMore: false,
      sort: 'newest',
    };
  }

  const [{ data: flatStats }, { data: mpRows }, trustScores] = await Promise.all([
    supabase
      .from('player_match_stats')
      .select('player_id, sport, runs_scored, wickets_taken, catches_taken, goals_scored, match_id')
      .in('player_id', playerIds),
    supabase
      .from('match_players')
      .select('match_id, player_id, team_name')
      .in('player_id', playerIds),
    getTrustScoresForPlayers(playerIds, supabase),
  ]);

  const statsList = (flatStats ?? []) as FlatPlayerStat[];
  const matchIds = [...new Set(statsList.map(s => s.match_id))];

  const { data: matchRows } = matchIds.length > 0
    ? await supabase
        .from('matches')
        .select('id, winner_team_id, winner_team_name, team_a_id, team_b_id, team_a_name, team_b_name, confirmation_state')
        .in('id', matchIds)
    : { data: [] as MatchMeta[] };

  const matchById = new Map<string, MatchMeta>();
  for (const m of (matchRows ?? []) as MatchMeta[]) {
    matchById.set(m.id, m);
  }

  const teamByPlayerMatch = new Map<string, string>();
  for (const row of mpRows ?? []) {
    teamByPlayerMatch.set(`${row.player_id}__${row.match_id}`, row.team_name);
  }

  const statsByPlayer = new Map<string, FlatPlayerStat[]>();
  for (const s of statsList) {
    if (!statsByPlayer.has(s.player_id)) statsByPlayer.set(s.player_id, []);
    statsByPlayer.get(s.player_id)!.push(s);
  }

  const items = players.map((p) => {
    const rawStats: RawStat[] = (statsByPlayer.get(p.id) ?? []).map((s) => {
      const m = matchById.get(s.match_id);
      return {
        sport: s.sport,
        runs_scored: s.runs_scored ?? 0,
        wickets_taken: s.wickets_taken ?? 0,
        catches_taken: s.catches_taken ?? 0,
        goals_scored: s.goals_scored ?? 0,
        match_id: s.match_id,
        matches: m
          ? {
              winner_team_id: m.winner_team_id,
              winner_team_name: m.winner_team_name,
              team_a_id: m.team_a_id,
              team_b_id: m.team_b_id,
              team_a_name: m.team_a_name,
              team_b_name: m.team_b_name,
              confirmation_state: m.confirmation_state,
            }
          : null,
      };
    });

    const mpForThisPlayer = rawStats.map(s => ({
      match_id: s.match_id,
      team_name: teamByPlayerMatch.get(`${p.id}__${s.match_id}`) ?? '',
    }));
    const enriched = enrichStatsWithTeamNames(rawStats, mpForThisPlayer);

    return {
      athlete: buildAthleteData(p, enriched),
      trustScore: trustScores.get(p.id),
    };
  });

  return {
    items,
    page: currentPage,
    pageSize: safePageSize,
    hasMore,
    sort: 'newest',
  };
}
