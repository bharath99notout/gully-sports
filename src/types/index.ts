export type SportType = 'cricket' | 'football' | 'badminton' | 'table_tennis' | 'foosball' | 'pickleball';
export type MatchStatus = 'upcoming' | 'live' | 'completed';

export interface Profile {
  id: string;
  name: string;
  phone?: string;
  avatar_url?: string;
  /** UPI VPA (e.g. 9876543210@ybl). Used by event cost split for tap-to-pay. */
  upi_vpa?: string | null;
  created_at: string;
  last_seen_at?: string | null;
  last_login_at?: string | null;
  is_admin?: boolean;
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
  badminton_target_points?: number;
  tt_sets?: number;
  tt_target_points?: number;
  pickleball_sets?: number;
  pickleball_target_points?: number;
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

export type TournamentFormat = 'league';
export type TournamentStatus = 'upcoming' | 'live' | 'completed';

export interface Tournament {
  id: string;
  name: string;
  sport: SportType;
  format: TournamentFormat;
  status: TournamentStatus;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
  created_by: string;
  created_at: string;
}

export interface TournamentTeam {
  tournament_id: string;
  team_id: string;
  joined_at: string;
}

export interface TournamentTeamPlayer {
  id: string;
  tournament_id: string;
  team_id: string;
  player_id: string;
  added_at: string;
}

export interface TournamentAward {
  id: string;
  tournament_id: string;
  award_type: string;
  player_id: string;
  display_value: string;
  awarded_at: string;
}

// ── Events (migration 023) ──────────────────────────────────────────────────

export type EventStatus = 'open' | 'closed' | 'completed' | 'cancelled';

export interface SportEvent {
  id: string;
  name: string;
  sport: SportType;
  host_id: string;
  start_at: string;
  end_at: string | null;
  venue_name: string | null;
  venue_map_url: string | null;
  capacity: number | null;
  description: string | null;
  invite_only: boolean;
  /** Host is actively looking for players — surfaces in the recruiting feed. */
  recruiting: boolean;
  status: EventStatus;
  cancellation_reason: string | null;
  rsvp_cutoff_at: string | null;
  cover_image_url: string | null;
  tournament_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── Pickup requests / "Need Players Now" (migration 033) ────────────────────

export type PickupStatus = 'open' | 'filled' | 'cancelled' | 'expired';

export type PickupResponseStatus =
  | 'requested' | 'accepted' | 'declined' | 'withdrew' | 'no_show' | 'showed_up';

export interface PickupRequest {
  id: string;
  host_id: string;
  sport: SportType;
  ground_name: string;
  ground_lat: number;
  ground_lng: number;
  slots_total: number;
  format: string | null;
  notes: string | null;
  start_time: string;
  expires_at: string;
  status: PickupStatus;
  match_id: string | null;
  created_at: string;
}

export interface PickupResponse {
  id: string;
  request_id: string;
  joiner_id: string;
  status: PickupResponseStatus;
  created_at: string;
  decided_at: string | null;
}

/**
 * What the dashboard rail / list pages render — request + denormalized host
 * profile + how many accepted responses there are.
 */
export interface PickupRequestWithMeta extends PickupRequest {
  host: { id: string; name: string; avatar_url: string | null };
  accepted_count: number;
  /** Distance in km from the viewer's current GPS, if known. */
  distance_km: number | null;
  /** The viewer's own response (if any) to this pickup. */
  viewer_response: PickupResponse | null;
}

// ── Bowling Analyzer (V1: manual-assist speed) ─────────────────────────────

export type BowlingPrivacyState = 'private' | 'match' | 'public';
export type BowlingRecordedVia  = 'manual_tap' | 'camera_cv' | 'radar' | 'imported';

export interface BowlingDelivery {
  id: string;
  bowler_id: string;
  match_id: string | null;
  over_index: number | null;
  recorded_at: string;
  recorded_via: BowlingRecordedVia;
  distance_m: number;
  duration_ms: number;
  speed_kmh: number;
  speed_is_outlier: boolean;
  privacy_state: BowlingPrivacyState;
  note: string | null;
}

/** What the "Bowling DNA" card needs — rolling avg + peak across the
 *  bowler's non-outlier deliveries. Single shape so the UI doesn't have to
 *  recompute. */
export interface BowlingDna {
  delivery_count: number;
  peak_kmh: number | null;
  rolling_avg_kmh: number | null;
}
