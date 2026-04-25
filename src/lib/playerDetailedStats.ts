import { createClient } from './supabase/server';
import {
  buildCricketDetail, buildFootballDetail, buildRacquetDetail,
  buildRacquetMatchInputs, enrichStatsWithTeamNames,
  type CricketDetail, type FootballDetail, type RacquetDetail, type RawStat,
} from './athleteData';

/**
 * Server-side aggregator that fetches everything needed for a player's
 * detailed stats accordion. Used by /players/[id] and /p/[id].
 *
 * It runs the auxiliary queries (match_scores, match_players for opponents)
 * only when the player has racquet matches — keeps cricket-only profiles fast.
 */
export interface DetailedStats {
  cricket:     CricketDetail;
  football:    FootballDetail;
  badminton:   RacquetDetail;
  tableTennis: RacquetDetail;
}

export async function fetchPlayerDetailedStats(
  playerId: string,
  /**
   * Pass already-fetched player_match_stats rows + match_players rows so we
   * don't re-query them on pages that already need them.
   */
  rawStats: RawStat[],
  myMatchPlayers: Array<{ match_id: string; team_name: string }>,
): Promise<DetailedStats> {
  const enriched = enrichStatsWithTeamNames(rawStats, myMatchPlayers);

  const cricket  = buildCricketDetail(enriched);
  const football = buildFootballDetail(enriched);

  const racquetRows = enriched.filter(
    r => r.sport === 'badminton' || r.sport === 'table_tennis',
  );

  if (racquetRows.length === 0) {
    const empty = (await import('./athleteData')).emptyRacquetDetail();
    return { cricket, football, badminton: empty, tableTennis: empty };
  }

  // Need set scores + every team's roster for these matches.
  const racquetMatchIds = [...new Set(racquetRows.map(r => r.match_id))];
  const supabase = await createClient();

  const [{ data: matchScores }, { data: allMatchPlayers }, { data: matchMeta }] = await Promise.all([
    supabase
      .from('match_scores')
      .select('match_id, team_name, sets')
      .in('match_id', racquetMatchIds),
    supabase
      .from('match_players')
      .select('match_id, player_id, team_name')
      .in('match_id', racquetMatchIds),
    supabase
      .from('matches')
      .select('id, played_at, sport')
      .in('id', racquetMatchIds),
  ]);

  const scoresByMatch = new Map<string, Array<{ team_name: string; sets: number[] | null }>>();
  for (const s of matchScores ?? []) {
    if (!scoresByMatch.has(s.match_id)) scoresByMatch.set(s.match_id, []);
    scoresByMatch.get(s.match_id)!.push({ team_name: s.team_name, sets: s.sets });
  }
  const playedAtByMatch = new Map<string, string | null>();
  const sportByMatch = new Map<string, string>();
  for (const m of matchMeta ?? []) {
    playedAtByMatch.set(m.id, m.played_at ?? null);
    sportByMatch.set(m.id, m.sport);
  }

  const badmintonRows   = racquetRows.filter(r => sportByMatch.get(r.match_id) === 'badminton');
  const tableTennisRows = racquetRows.filter(r => sportByMatch.get(r.match_id) === 'table_tennis');

  const badminton = buildRacquetDetail(buildRacquetMatchInputs(
    badmintonRows, allMatchPlayers ?? [], scoresByMatch, playedAtByMatch, playerId, true,
  ));
  const tableTennis = buildRacquetDetail(buildRacquetMatchInputs(
    tableTennisRows, allMatchPlayers ?? [], scoresByMatch, playedAtByMatch, playerId, false,
  ));

  return { cricket, football, badminton, tableTennis };
}
