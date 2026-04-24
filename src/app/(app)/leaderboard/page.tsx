import { createClient } from '@/lib/supabase/server';
import LeaderboardClient, { LeaderboardEntry } from './LeaderboardClient';
import { calcCaliber, calcSportPoints, SportKey, SportStat, PerMatchStat } from '@/lib/caliber';

interface RawStat {
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
  } | null;
}

interface SetRow {
  match_id: string;
  team_name: string;
  sets: number[] | null;
}

export default async function LeaderboardPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('player_match_stats')
    .select(`
      player_id, sport, runs_scored, wickets_taken, catches_taken, goals_scored, match_id,
      profiles(id, name, avatar_url),
      matches(winner_team_id, winner_team_name, team_a_id, team_b_id, team_a_name, team_b_name)
    `)
    .returns<RawStat[]>();

  const raw = data ?? [];
  const matchIds = Array.from(new Set(raw.map(r => r.match_id)));

  // Map: `${match_id}__${player_id}` → team_name (to attribute wins)
  const playerTeamMap = new Map<string, string>();
  /** Badminton: exactly 1 player per side → singles; any side with 2+ → doubles */
  const badmintonFormatByMatch = new Map<string, 'singles' | 'doubles'>();
  if (matchIds.length > 0) {
    const { data: mp } = await supabase
      .from('match_players')
      .select('match_id, player_id, team_name')
      .in('match_id', matchIds);
    for (const row of mp ?? []) {
      playerTeamMap.set(`${row.match_id}__${row.player_id}`, row.team_name);
    }
    const badmintonMatchIds = new Set(raw.filter(r => r.sport === 'badminton').map(r => r.match_id));
    const playersPerTeam = new Map<string, Map<string, number>>(); // match_id → team_name → count
    for (const row of mp ?? []) {
      if (!badmintonMatchIds.has(row.match_id)) continue;
      if (!playersPerTeam.has(row.match_id)) playersPerTeam.set(row.match_id, new Map());
      const tm = playersPerTeam.get(row.match_id)!;
      tm.set(row.team_name, (tm.get(row.team_name) ?? 0) + 1);
    }
    for (const mid of badmintonMatchIds) {
      const tm = playersPerTeam.get(mid);
      const counts = tm ? [...tm.values()].filter(c => c > 0).sort((a, b) => a - b) : [];
      const singles = counts.length >= 2 && counts.every(c => c === 1);
      badmintonFormatByMatch.set(mid, singles ? 'singles' : 'doubles');
    }
  }

  // Map: `${match_id}__${team_name}` → sets[]  (for badminton bonuses)
  const setsMap = new Map<string, number[]>();
  const matchTeamNames = new Map<string, [string, string]>(); // match_id → [teamA, teamB]
  if (matchIds.length > 0) {
    const { data: ms } = await supabase
      .from('match_scores')
      .select('match_id, team_name, sets')
      .in('match_id', matchIds)
      .returns<SetRow[]>();
    for (const row of ms ?? []) {
      if (row.sets?.length) setsMap.set(`${row.match_id}__${row.team_name}`, row.sets);
    }
  }
  for (const r of raw) {
    if (r.matches && !matchTeamNames.has(r.match_id)) {
      matchTeamNames.set(r.match_id, [r.matches.team_a_name, r.matches.team_b_name]);
    }
  }

  type AggRow = {
    player_id: string;
    name: string;
    avatar_url: string | null;
    sport: SportKey;
    stat: SportStat;
    perMatch: PerMatchStat[];
  };

  // Combined per (player, sport) — one badminton bucket per player for the "All" tab
  const agg = new Map<string, AggRow>();
  // Badminton only: separate career stats for singles vs doubles matches
  const aggBadmintonSingles = new Map<string, AggRow>();
  const aggBadmintonDoubles = new Map<string, AggRow>();

  function ensureAggRow(map: Map<string, AggRow>, key: string, r: RawStat): AggRow {
    if (!map.has(key)) {
      map.set(key, {
        player_id: r.player_id,
        name: r.profiles!.name,
        avatar_url: r.profiles!.avatar_url,
        sport: r.sport,
        stat: { matches: 0, wins: 0, runs: 0, wickets: 0, catches: 0, goals: 0 },
        perMatch: [],
      });
    }
    return map.get(key)!;
  }

  for (const r of raw) {
    if (!r.profiles) continue;
    const combinedKey = `${r.player_id}__${r.sport}`;
    const targets: { map: Map<string, AggRow>; key: string }[] = [{ map: agg, key: combinedKey }];
    if (r.sport === 'badminton') {
      const fmt = badmintonFormatByMatch.get(r.match_id) ?? 'doubles';
      targets.push({
        map: fmt === 'singles' ? aggBadmintonSingles : aggBadmintonDoubles,
        key: r.player_id,
      });
    }

    // Determine win for THIS match
    const winner = r.matches?.winner_team_name
      ?? (r.matches?.winner_team_id && r.matches.winner_team_id === r.matches.team_a_id ? r.matches.team_a_name
        : r.matches?.winner_team_id && r.matches.winner_team_id === r.matches.team_b_id ? r.matches.team_b_name : null);
    const playerTeam = playerTeamMap.get(`${r.match_id}__${r.player_id}`);
    const won = !!(winner && playerTeam && winner === playerTeam);

    let setsWon = 0, cleanSweeps = 0;
    if ((r.sport === 'badminton' || r.sport === 'table_tennis') && playerTeam) {
      const teams = matchTeamNames.get(r.match_id);
      const opponentName = teams?.[0] === playerTeam ? teams?.[1] : teams?.[0];
      const mySets = setsMap.get(`${r.match_id}__${playerTeam}`) ?? [];
      const oppSets = opponentName ? setsMap.get(`${r.match_id}__${opponentName}`) ?? [] : [];
      for (let i = 0; i < mySets.length; i++) {
        const mine = mySets[i] ?? 0;
        const opp  = oppSets[i] ?? 0;
        if (mine > opp) setsWon += 1;
        if (mine > 0 && opp === 0) cleanSweeps += 1;
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

  // Build entries
  const cricket: LeaderboardEntry[] = [];
  const football: LeaderboardEntry[] = [];
  const badmintonSingles: LeaderboardEntry[] = [];
  const badmintonDoubles: LeaderboardEntry[] = [];
  const table_tennis: LeaderboardEntry[] = [];

  // Aggregate per player across sports for the "All" leaderboard
  const allByPlayer = new Map<string, {
    player_id: string;
    name: string;
    avatar_url: string | null;
    totalPoints: number;
    scoreSum: number;
    scoreCount: number;
    matches: number;
    wins: number;
    activeSports: Set<string>;
  }>();

  function pushEntry(a: AggRow, entry: LeaderboardEntry) {
    if (a.sport === 'cricket')       cricket.push(entry);
    if (a.sport === 'football')      football.push(entry);
    if (a.sport === 'table_tennis')  table_tennis.push(entry);
  }

  for (const a of agg.values()) {
    const score  = calcCaliber(a.sport, a.stat);
    const points = calcSportPoints(a.sport, a.perMatch);
    const entry: LeaderboardEntry = {
      player_id: a.player_id,
      name: a.name,
      avatar_url: a.avatar_url,
      score,
      points,
      matches: a.stat.matches,
      wins: a.stat.wins,
      runs: a.stat.runs,
      wickets: a.stat.wickets,
      goals: a.stat.goals,
    };
    if (a.sport !== 'badminton') pushEntry(a, entry);

    // Roll into "All" aggregate
    if (!allByPlayer.has(a.player_id)) {
      allByPlayer.set(a.player_id, {
        player_id: a.player_id, name: a.name, avatar_url: a.avatar_url,
        totalPoints: 0, scoreSum: 0, scoreCount: 0, matches: 0, wins: 0,
        activeSports: new Set(),
      });
    }
    const p = allByPlayer.get(a.player_id)!;
    p.totalPoints += points;
    if (score > 0) { p.scoreSum += score; p.scoreCount += 1; }
    p.matches += a.stat.matches;
    p.wins += a.stat.wins;
    p.activeSports.add(a.sport);
  }

  for (const a of aggBadmintonSingles.values()) {
    const score  = calcCaliber(a.sport, a.stat);
    const points = calcSportPoints(a.sport, a.perMatch);
    badmintonSingles.push({
      player_id: a.player_id,
      name: a.name,
      avatar_url: a.avatar_url,
      score,
      points,
      matches: a.stat.matches,
      wins: a.stat.wins,
      runs: a.stat.runs,
      wickets: a.stat.wickets,
      goals: a.stat.goals,
    });
  }
  for (const a of aggBadmintonDoubles.values()) {
    const score  = calcCaliber(a.sport, a.stat);
    const points = calcSportPoints(a.sport, a.perMatch);
    badmintonDoubles.push({
      player_id: a.player_id,
      name: a.name,
      avatar_url: a.avatar_url,
      score,
      points,
      matches: a.stat.matches,
      wins: a.stat.wins,
      runs: a.stat.runs,
      wickets: a.stat.wickets,
      goals: a.stat.goals,
    });
  }

  const all: LeaderboardEntry[] = Array.from(allByPlayer.values()).map(p => ({
    player_id: p.player_id,
    name: p.name,
    avatar_url: p.avatar_url,
    score:   p.scoreCount > 0 ? Math.round(p.scoreSum / p.scoreCount) : 0,
    points:  p.totalPoints,
    matches: p.matches,
    wins:    p.wins,
    runs: 0, wickets: 0, goals: 0,
    sports_played: p.activeSports.size,
  }));

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">🏆 Leaderboard</h1>
      <p className="text-sm text-gray-500 mb-5">Top players ranked by skill or career points</p>
      <LeaderboardClient
        cricket={cricket}
        football={football}
        badmintonSingles={badmintonSingles}
        badmintonDoubles={badmintonDoubles}
        table_tennis={table_tennis}
        all={all}
      />
    </div>
  );
}
