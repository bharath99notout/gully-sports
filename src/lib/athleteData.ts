import { SportKey, SportStat } from './caliber';
import { AthleteData } from '@/components/AthleteCard';

type RawStat = {
  sport: string;
  runs_scored: number;
  wickets_taken: number;
  catches_taken: number;
  goals_scored: number;
  match_id: string;
  matches: { winner_team_id: string | null; team_a_id: string | null; team_b_id: string | null } | null;
};

export function buildAthleteData(
  profile: { id: string; name: string; avatar_url?: string | null; created_at: string },
  stats: RawStat[]
): AthleteData {
  const sports: SportKey[] = ['cricket', 'football', 'badminton'];

  const sportStats = sports.reduce((acc, sport) => {
    const rows = stats.filter(s => s.sport === sport);
    const matchIds = new Set(rows.map(s => s.match_id));
    const wins = rows.filter(s => {
      const m = s.matches;
      if (!m?.winner_team_id) return false;
      return m.winner_team_id === m.team_a_id || m.winner_team_id === m.team_b_id;
    }).length;

    acc[sport] = {
      matches: matchIds.size,
      wins,
      runs: rows.reduce((s, r) => s + (r.runs_scored ?? 0), 0),
      wickets: rows.reduce((s, r) => s + (r.wickets_taken ?? 0), 0),
      catches: rows.reduce((s, r) => s + (r.catches_taken ?? 0), 0),
      goals: rows.reduce((s, r) => s + (r.goals_scored ?? 0), 0),
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
