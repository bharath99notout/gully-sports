import { createClient } from '@/lib/supabase/server';
import LeaderboardClient, { LeaderboardEntry } from './LeaderboardClient';
import { calcCaliber, SportKey, SportStat } from '@/lib/caliber';

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

  // Aggregate per (player_id, sport)
  const agg = new Map<string, {
    player_id: string;
    name: string;
    avatar_url: string | null;
    sport: SportKey;
    stat: SportStat;
    playerTeamByMatch: Map<string, string>;
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
        playerTeamByMatch: new Map(),
      });
    }
    const a = agg.get(key)!;
    a.stat.matches += 1;
    a.stat.runs += r.runs_scored ?? 0;
    a.stat.wickets += r.wickets_taken ?? 0;
    a.stat.catches += r.catches_taken ?? 0;
    a.stat.goals += r.goals_scored ?? 0;

    // Win counting — compare winner with match_players (we don't have team info on
    // player_match_stats, so we derive a win if the match winner name matches ANY
    // team this player is on — cheap approximation)
    if (r.matches?.winner_team_name) {
      // Heuristic: the player was on either team A or B; assume they won if their
      // name is recorded on the winning team. Without team_name on stats, we
      // count matches where a winner exists and the player appears in the match
      // — simpler: count wins only if we can correlate. We'll fetch match_players
      // separately below.
    }
  }

  // Second pass: fetch match_players to attribute wins correctly
  const matchIds = Array.from(new Set(raw.map(r => r.match_id)));
  let playerTeamMap = new Map<string, string>(); // `${match_id}__${player_id}` → team_name
  if (matchIds.length > 0) {
    const { data: mp } = await supabase
      .from('match_players')
      .select('match_id, player_id, team_name')
      .in('match_id', matchIds);
    for (const row of mp ?? []) {
      playerTeamMap.set(`${row.match_id}__${row.player_id}`, row.team_name);
    }
  }

  // Third pass: count wins
  for (const r of raw) {
    if (!r.matches) continue;
    const winner = r.matches.winner_team_name
      ?? (r.matches.winner_team_id === r.matches.team_a_id ? r.matches.team_a_name
        : r.matches.winner_team_id === r.matches.team_b_id ? r.matches.team_b_name : null);
    if (!winner) continue;
    const playerTeam = playerTeamMap.get(`${r.match_id}__${r.player_id}`);
    if (playerTeam === winner) {
      const key = `${r.player_id}__${r.sport}`;
      const a = agg.get(key);
      if (a) a.stat.wins += 1;
    }
  }

  // Build leaderboard entries per sport
  const byScore = (a: LeaderboardEntry, b: LeaderboardEntry) => b.score - a.score;
  const cricket: LeaderboardEntry[] = [];
  const football: LeaderboardEntry[] = [];
  const badminton: LeaderboardEntry[] = [];

  for (const a of agg.values()) {
    const score = calcCaliber(a.sport, a.stat);
    const entry: LeaderboardEntry = {
      player_id: a.player_id,
      name: a.name,
      avatar_url: a.avatar_url,
      score,
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

  cricket.sort(byScore);
  football.sort(byScore);
  badminton.sort(byScore);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">🏆 Leaderboard</h1>
      <p className="text-sm text-gray-500 mb-5">Top players ranked by caliber score</p>
      <LeaderboardClient cricket={cricket} football={football} badminton={badminton} />
    </div>
  );
}
