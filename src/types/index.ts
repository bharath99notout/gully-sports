export type SportType = 'cricket' | 'football' | 'badminton';
export type MatchStatus = 'upcoming' | 'live' | 'completed';

export interface Profile {
  id: string;
  name: string;
  phone?: string;
  avatar_url?: string;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  sport: SportType;
  created_by: string;
  created_at: string;
  team_members?: TeamMember[];
}

export interface TeamMember {
  id: string;
  team_id: string;
  player_id: string;
  created_at: string;
  profiles?: Profile;
}

export interface Match {
  id: string;
  sport: SportType;
  status: MatchStatus;
  team_a_id?: string;
  team_b_id?: string;
  team_a_name: string;
  team_b_name: string;
  winner_team_id?: string;
  winner_team_name?: string | null;
  created_by: string;
  played_at: string;
  created_at: string;
  cricket_overs?: number;
  badminton_sets?: number;
  match_scores?: MatchScore[];
  // Cricket live state
  batting_team_name?: string | null;
  striker_id?: string | null;
  non_striker_id?: string | null;
  bowler_id?: string | null;
  current_innings?: number | null;
}

export interface MatchScore {
  id: string;
  match_id: string;
  team_id?: string;
  team_name: string;
  runs: number;
  wickets: number;
  overs_faced: number;
  goals: number;
  sets?: number[];
  updated_at: string;
}

export interface MatchPlayer {
  id: string;
  match_id: string;
  player_id: string;
  team_name: string;
  name: string;
}

export interface CricketPlayerStat {
  runs_scored: number;
  wickets_taken: number;
  catches_taken: number;
  balls_faced?: number;
  fours?: number;
  sixes?: number;
  balls_bowled?: number;
  runs_conceded?: number;
  is_out?: boolean;
  dismissal?: string | null;
}

export interface PlayerMatchStats {
  id: string;
  match_id: string;
  player_id: string;
  team_id?: string;
  sport: SportType;
  runs_scored: number;
  wickets_taken: number;
  catches_taken: number;
  goals_scored: number;
  points_won: number;
}

export interface PlayerStats {
  player_id: string;
  name: string;
  sport: SportType;
  matches_played: number;
  wins: number;
  losses: number;
  total_runs: number;
  total_wickets: number;
  total_goals: number;
}
