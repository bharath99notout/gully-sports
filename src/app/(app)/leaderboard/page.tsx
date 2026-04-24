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
  if (matchIds.length > 0) {
    const { data: mp } = await supabase
      .from('match_players')
      .select('match_id, player_id, team_name')
      .in('match_id', matchIds);
    for (const row of mp ?? []) {
      playerTeamMap.set(`${row.match_id}__${row.player_id}`, row.team_name);
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

  // Aggregate
  const agg = new Map<string, {
    player_id: string;
    name: string;
    avatar_url: string | null;
    sport: SportKey;
    stat: SportStat;
    perMatch: PerMatchStat[];
  }>();

  for (const r of raw) {
    if (!r.profiles) continue;
    const key = `${r.player_id}__${r.sport}`;
    if (!agg.has(key)) {
      agg.set(key, {
        player_id: r.player_id,
        name: r.profiles.name,
        avatar_url: r.profiles.avatar_url,
        sport: r.sport,
        stat: { matches: 0, wins: 0, runs: 0, wickets: 0, catches: 0, goals: 0 },
        perMatch: [],
      });
    }
    const a = agg.get(key)!;

    // Determine win for THIS match
    const winner = r.matches?.winner_team_name
      ?? (r.matches?.winner_team_id && r.matches.winner_team_id === r.matches.team_a_id ? r.matches.team_a_name
        : r.matches?.winner_team_id && r.matches.winner_team_id === r.matches.team_b_id ? r.matches.team_b_name : null);
    const playerTeam = playerTeamMap.get(`${r.match_id}__${r.player_id}`);
    const won = !!(winner && playerTeam && winner === playerTeam);

    // Aggregate totals
    a.stat.matches += 1;
    if (won) a.stat.wins += 1;
    a.stat.runs    += r.runs_scored    ?? 0;
    a.stat.wickets += r.wickets_taken  ?? 0;
    a.stat.catches += r.catches_taken  ?? 0;
    a.stat.goals   += r.goals_scored   ?? 0;

    // Badminton: compute sets_won + clean_sweeps for this match
    let setsWon = 0, cleanSweeps = 0;
    if (r.sport === 'badminton' && playerTeam) {
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

    a.perMatch.push({
      runs_scored:   r.runs_scored   ?? 0,
      wickets_taken: r.wickets_taken ?? 0,
      catches_taken: r.catches_taken ?? 0,
      goals_scored:  r.goals_scored  ?? 0,
      sets_won:      setsWon,
      clean_sweeps:  cleanSweeps,
      won,
    });
  }

  // Build entries
  const cricket: LeaderboardEntry[] = [];
  const football: LeaderboardEntry[] = [];
  const badminton: LeaderboardEntry[] = [];

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
    if (a.sport === 'cricket')   cricket.push(entry);
    if (a.sport === 'football')  football.push(entry);
    if (a.sport === 'badminton') badminton.push(entry);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">🏆 Leaderboard</h1>
      <p className="text-sm text-gray-500 mb-5">Top players ranked by skill or career points</p>
      <LeaderboardClient cricket={cricket} football={football} badminton={badminton} />
    </div>
  );
}
