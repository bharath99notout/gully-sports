import 'server-only';
import { createClient } from './supabase/server';
import {
  calcCaliber,
  calcSportPoints,
  type SportKey,
  type SportStat,
  type PerMatchStat,
} from './caliber';
import type { LeaderboardEntry } from '@/app/(app)/leaderboard/LeaderboardClient';

/**
 * Server-side leaderboard builder scoped to a single event's matches.
 *
 * Mirrors the aggregation in `/leaderboard/page.tsx` (caliber 0–100 + career
 * points) so the per-event leaderboard reads with the same medal / avatar /
 * skill+points layout as the global feed. Set-based sports (badminton, TT)
 * get split by singles vs doubles — the per-match team-size determines
 * which bucket a result lands in.
 *
 * Why we don't filter by `confirmation_state = 'confirmed'` here (unlike
 * global): an event is a closed circle — the host runs the show, the
 * confirmation flow is overkill, and the host needs the leaderboard to
 * update the moment a match ends so they can tell players the result.
 */
export interface EventLeaderboardOutput {
  sport: SportKey;
  /** Cricket / football: the only entry list. Empty for set sports. */
  main: LeaderboardEntry[];
  /** Set sports only — populated for badminton + table_tennis. */
  singles: LeaderboardEntry[];
  doubles: LeaderboardEntry[];
}

interface RawStatRow {
  player_id: string;
  match_id: string;
  sport: SportKey;
  runs_scored: number | null;
  wickets_taken: number | null;
  catches_taken: number | null;
  goals_scored: number | null;
  profiles: { id: string; name: string; avatar_url: string | null } | null;
  matches: {
    team_a_id: string | null;
    team_b_id: string | null;
    team_a_name: string;
    team_b_name: string;
    winner_team_id: string | null;
    winner_team_name: string | null;
  } | null;
}

interface MatchPlayerRow { match_id: string; player_id: string; team_name: string }
interface MatchScoreRow { match_id: string; team_name: string; sets: number[] | null }

interface AggRow {
  player_id: string;
  name: string;
  avatar_url: string | null;
  sport: SportKey;
  stat: SportStat;
  perMatch: PerMatchStat[];
}

function ensureAggRow(map: Map<string, AggRow>, key: string, r: RawStatRow): AggRow {
  let row = map.get(key);
  if (!row) {
    row = {
      player_id: r.player_id,
      name: r.profiles?.name ?? 'Unknown',
      avatar_url: r.profiles?.avatar_url ?? null,
      sport: r.sport,
      stat: { matches: 0, wins: 0, runs: 0, wickets: 0, catches: 0, goals: 0 },
      perMatch: [],
    };
    map.set(key, row);
  }
  return row;
}

function entryFromAgg(a: AggRow): LeaderboardEntry {
  return {
    player_id: a.player_id,
    name: a.name,
    avatar_url: a.avatar_url,
    score: calcCaliber(a.sport, a.stat),
    points: calcSportPoints(a.sport, a.perMatch),
    matches: a.stat.matches,
    wins: a.stat.wins,
    runs: a.stat.runs,
    wickets: a.stat.wickets,
    catches: a.stat.catches,
    goals: a.stat.goals,
  };
}

export async function buildEventLeaderboard(
  eventId: string,
  sport: SportKey,
): Promise<EventLeaderboardOutput> {
  const supabase = await createClient();

  // 1. Match IDs in this event.
  const { data: links } = await supabase
    .from('event_matches')
    .select('match_id')
    .eq('event_id', eventId);
  const matchIds = (links ?? []).map(l => l.match_id);
  if (matchIds.length === 0) {
    return { sport, main: [], singles: [], doubles: [] };
  }

  // 2. Player stats joined with match winner info + profile in one shot.
  const { data: rawStats } = await supabase
    .from('player_match_stats')
    .select(`
      player_id, match_id, sport,
      runs_scored, wickets_taken, catches_taken, goals_scored,
      profiles(id, name, avatar_url),
      matches(team_a_id, team_b_id, team_a_name, team_b_name, winner_team_id, winner_team_name)
    `)
    .in('match_id', matchIds);
  const rows = ((rawStats ?? []) as unknown) as RawStatRow[];
  if (rows.length === 0) {
    return { sport, main: [], singles: [], doubles: [] };
  }

  // 3. Win attribution: which team did each player play for in each match?
  const { data: mp } = await supabase
    .from('match_players')
    .select('match_id, player_id, team_name')
    .in('match_id', matchIds);
  const playerTeamMap = new Map<string, string>();
  // Per-match team sizes for set-sport singles/doubles detection.
  const matchTeamSizes = new Map<string, Map<string, number>>();
  for (const row of (mp ?? []) as MatchPlayerRow[]) {
    playerTeamMap.set(`${row.match_id}__${row.player_id}`, row.team_name);
    if (!matchTeamSizes.has(row.match_id)) matchTeamSizes.set(row.match_id, new Map());
    const m = matchTeamSizes.get(row.match_id)!;
    m.set(row.team_name, (m.get(row.team_name) ?? 0) + 1);
  }

  // 4. Set scores for badminton / TT bonuses. Foosball gets the
  //    singles/doubles split heuristic but skips the set-bonus query
  //    since it doesn't track set scoring.
  const isSetSport = sport === 'badminton' || sport === 'table_tennis' || sport === 'foosball';
  const tracksSets = sport === 'badminton' || sport === 'table_tennis';
  const setsByMatchTeam = new Map<string, number[]>();
  if (tracksSets) {
    const { data: ms } = await supabase
      .from('match_scores')
      .select('match_id, team_name, sets')
      .in('match_id', matchIds);
    for (const r of (ms ?? []) as MatchScoreRow[]) {
      if (r.sets?.length) setsByMatchTeam.set(`${r.match_id}__${r.team_name}`, r.sets);
    }
  }

  // 5. Format-by-match for set sports: a match where every team has exactly
  //    one player is "singles", anything else is "doubles". Mirrors the
  //    global leaderboard's heuristic.
  function formatForMatch(matchId: string): 'singles' | 'doubles' {
    const sizes = matchTeamSizes.get(matchId);
    if (!sizes) return 'doubles';
    const counts = [...sizes.values()];
    return counts.length >= 2 && counts.every(c => c === 1) ? 'singles' : 'doubles';
  }

  // 6. Aggregate — main bucket per (player, sport), plus singles/doubles
  //    buckets per player for set sports.
  const main = new Map<string, AggRow>();
  const singles = new Map<string, AggRow>();
  const doubles = new Map<string, AggRow>();

  for (const r of rows) {
    if (!r.profiles || !r.matches) continue;
    if (r.sport !== sport) continue; // event matches should all match the event's sport

    const targets: { map: Map<string, AggRow>; key: string }[] = [];
    targets.push({ map: main, key: r.player_id });
    if (isSetSport) {
      const fmt = formatForMatch(r.match_id);
      targets.push({ map: fmt === 'singles' ? singles : doubles, key: r.player_id });
    }

    // Did this player win?
    const playerTeam = playerTeamMap.get(`${r.match_id}__${r.player_id}`);
    const winnerName = r.matches.winner_team_name
      ?? (r.matches.winner_team_id && r.matches.winner_team_id === r.matches.team_a_id ? r.matches.team_a_name
        : r.matches.winner_team_id && r.matches.winner_team_id === r.matches.team_b_id ? r.matches.team_b_name : null);
    const won = !!(winnerName && playerTeam && winnerName === playerTeam);

    // Set-sport bonuses. Skipped for foosball (doesn't track sets).
    let setsWon = 0;
    let cleanSweeps = 0;
    if (tracksSets && playerTeam) {
      const opponent = playerTeam === r.matches.team_a_name ? r.matches.team_b_name : r.matches.team_a_name;
      const my = setsByMatchTeam.get(`${r.match_id}__${playerTeam}`) ?? [];
      const opp = setsByMatchTeam.get(`${r.match_id}__${opponent}`) ?? [];
      for (let i = 0; i < my.length; i++) {
        const m = my[i] ?? 0;
        const o = opp[i] ?? 0;
        if (m > o) setsWon += 1;
        if (m > 0 && o === 0) cleanSweeps += 1;
      }
    }

    const perMatch: PerMatchStat = {
      runs_scored:   r.runs_scored   ?? 0,
      wickets_taken: r.wickets_taken ?? 0,
      catches_taken: r.catches_taken ?? 0,
      goals_scored:  r.goals_scored  ?? 0,
      sets_won:      setsWon,
      clean_sweeps:  cleanSweeps,
      won,
    };

    for (const { map, key } of targets) {
      const a = ensureAggRow(map, key, r);
      a.stat.matches += 1;
      if (won) a.stat.wins += 1;
      a.stat.runs    += r.runs_scored    ?? 0;
      a.stat.wickets += r.wickets_taken  ?? 0;
      a.stat.catches += r.catches_taken  ?? 0;
      a.stat.goals   += r.goals_scored   ?? 0;
      a.perMatch.push(perMatch);
    }
  }

  return {
    sport,
    main: [...main.values()].map(entryFromAgg),
    singles: [...singles.values()].map(entryFromAgg),
    doubles: [...doubles.values()].map(entryFromAgg),
  };
}
