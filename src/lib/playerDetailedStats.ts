import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from './supabase/server';
import {
  buildCricketDetail, buildFootballDetail, buildRacquetDetail,
  buildRacquetMatchInputs, buildFoosballDetail, buildFoosballMatchInputs,
  enrichStatsWithTeamNames,
  type CricketDetail, type FootballDetail, type RacquetDetail,
  type FoosballDetail, type RawStat,
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
  pickleball:  RacquetDetail;
  foosball:    FoosballDetail;
}

export async function fetchPlayerDetailedStats(
  playerId: string,
  /**
   * Pass already-fetched player_match_stats rows + match_players rows so we
   * don't re-query them on pages that already need them.
   */
  rawStats: RawStat[],
  myMatchPlayers: Array<{ match_id: string; team_name: string }>,
  /** When set, avoids a second `createClient()` (same request as the caller). */
  supabaseClient?: SupabaseClient,
): Promise<DetailedStats> {
  const enriched = enrichStatsWithTeamNames(rawStats, myMatchPlayers);

  const cricket  = buildCricketDetail(enriched);
  const football = buildFootballDetail(enriched);

  const racquetRows = enriched.filter(
    r => r.sport === 'badminton' || r.sport === 'table_tennis' || r.sport === 'pickleball',
  );
  const foosballRows = enriched.filter(r => r.sport === 'foosball');

  if (racquetRows.length === 0 && foosballRows.length === 0) {
    const ad = await import('./athleteData');
    const empty = ad.emptyRacquetDetail();
    return {
      cricket, football,
      badminton: empty,
      tableTennis: empty,
      pickleball: empty,
      foosball: ad.emptyFoosballDetail(),
    };
  }

  // We need match_players (rosters) and matches (played_at) for both racquet
  // and foosball matches. match_scores is racquet-only (sets).
  const racquetMatchIds  = [...new Set(racquetRows.map(r => r.match_id))];
  const foosballMatchIds = [...new Set(foosballRows.map(r => r.match_id))];
  const allDetailMatchIds = [...new Set([...racquetMatchIds, ...foosballMatchIds])];

  const supabase = supabaseClient ?? (await createClient());

  const [{ data: matchScores }, { data: allMatchPlayers }, { data: matchMeta }] = await Promise.all([
    racquetMatchIds.length > 0
      ? supabase
          .from('match_scores')
          .select('match_id, team_name, sets')
          .in('match_id', racquetMatchIds)
      : Promise.resolve({ data: [] as Array<{ match_id: string; team_name: string; sets: number[] | null }> }),
    supabase
      .from('match_players')
      .select('match_id, player_id, team_name')
      .in('match_id', allDetailMatchIds),
    supabase
      .from('matches')
      .select('id, played_at, sport')
      .in('id', allDetailMatchIds),
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

  const ad = await import('./athleteData');
  const emptyRacquet = ad.emptyRacquetDetail();

  const badmintonRows   = racquetRows.filter(r => sportByMatch.get(r.match_id) === 'badminton');
  const tableTennisRows = racquetRows.filter(r => sportByMatch.get(r.match_id) === 'table_tennis');
  const pickleballRows  = racquetRows.filter(r => sportByMatch.get(r.match_id) === 'pickleball');

  const badminton = badmintonRows.length > 0
    ? buildRacquetDetail(buildRacquetMatchInputs(
        badmintonRows, allMatchPlayers ?? [], scoresByMatch, playedAtByMatch, playerId, true,
      ))
    : emptyRacquet;
  const tableTennis = tableTennisRows.length > 0
    ? buildRacquetDetail(buildRacquetMatchInputs(
        tableTennisRows, allMatchPlayers ?? [], scoresByMatch, playedAtByMatch, playerId, false,
      ))
    : emptyRacquet;
  const pickleball = pickleballRows.length > 0
    ? buildRacquetDetail(buildRacquetMatchInputs(
        pickleballRows, allMatchPlayers ?? [], scoresByMatch, playedAtByMatch, playerId, false,
      ))
    : emptyRacquet;

  const foosball = foosballRows.length > 0
    ? buildFoosballDetail(buildFoosballMatchInputs(
        foosballRows, allMatchPlayers ?? [], playedAtByMatch, playerId,
      ))
    : ad.emptyFoosballDetail();

  return { cricket, football, badminton, tableTennis, pickleball, foosball };
}
