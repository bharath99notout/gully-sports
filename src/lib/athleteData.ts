import { SportKey, SportStat } from './caliber';
import { AthleteData } from '@/components/AthleteCard';

export type RawStat = {
  sport: string;
  runs_scored: number;
  wickets_taken: number;
  catches_taken: number;
  goals_scored: number;
  match_id: string;
  /** Optional: the team name this player was on in this match (from match_players) */
  my_team_name?: string | null;
  matches: {
    winner_team_id: string | null;
    winner_team_name?: string | null;
    team_a_id: string | null;
    team_b_id: string | null;
    team_a_name?: string | null;
    team_b_name?: string | null;
  } | null;
};

function isWinForPlayer(r: RawStat): boolean {
  const m = r.matches;
  if (!m) return false;

  // Preferred path: compare saved winner_team_name with player's team_name in that match
  if (m.winner_team_name && r.my_team_name) {
    return m.winner_team_name === r.my_team_name;
  }

  // Legacy / ID-based: compare winner_team_id with the player's team (requires team IDs)
  if (m.winner_team_id) {
    // We don't know which team the player was on by ID alone, so rely on name match if we have it
    if (r.my_team_name && m.team_a_name && m.team_b_name) {
      const playerSide: 'a' | 'b' | null =
        r.my_team_name === m.team_a_name ? 'a' :
        r.my_team_name === m.team_b_name ? 'b' : null;
      if (playerSide === 'a') return m.winner_team_id === m.team_a_id;
      if (playerSide === 'b') return m.winner_team_id === m.team_b_id;
    }
  }

  return false;
}

export function buildAthleteData(
  profile: { id: string; name: string; avatar_url?: string | null; created_at: string },
  stats: RawStat[]
): AthleteData {
  const sports: SportKey[] = ['cricket', 'football', 'badminton', 'table_tennis'];

  const sportStats = sports.reduce((acc, sport) => {
    const rows = stats.filter(s => s.sport === sport);
    const matchIds = new Set(rows.map(s => s.match_id));
    const wins = rows.filter(isWinForPlayer).length;

    acc[sport] = {
      matches: matchIds.size,
      wins,
      runs:    rows.reduce((s, r) => s + (r.runs_scored    ?? 0), 0),
      wickets: rows.reduce((s, r) => s + (r.wickets_taken  ?? 0), 0),
      catches: rows.reduce((s, r) => s + (r.catches_taken  ?? 0), 0),
      goals:   rows.reduce((s, r) => s + (r.goals_scored   ?? 0), 0),
    };
    return acc;
  }, {} as Record<SportKey, SportStat>);

  return {
    id: profile.id,
    name: profile.name,
    avatarUrl: profile.avatar_url,
    joinedYear: new Date(profile.created_at).getFullYear(),
    sportStats,
  };
}

/**
 * Helper to enrich raw stats with the player's team_name per match.
 * Caller fetches `match_players` rows for the player; this wires them into the stats.
 */
export function enrichStatsWithTeamNames(
  stats: RawStat[],
  matchPlayers: Array<{ match_id: string; team_name: string }>,
): RawStat[] {
  const teamByMatch = new Map<string, string>();
  for (const mp of matchPlayers) teamByMatch.set(mp.match_id, mp.team_name);
  return stats.map(s => ({ ...s, my_team_name: s.my_team_name ?? teamByMatch.get(s.match_id) ?? null }));
}
