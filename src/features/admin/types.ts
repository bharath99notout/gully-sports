export type AdminAuditEventType =
  | 'login_success'
  | 'match_created'
  | 'match_confirmed'
  | 'match_disputed'
  | 'match_force_pushed'
  | 'match_admin_approved'
  | 'match_admin_rejected'
  | 'match_admin_deleted';

export type AdminAuditEvent = {
  id: string;
  actor_user_id: string | null;
  actor_name: string;
  actor_phone: string | null;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AdminUserRow = {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
  last_seen_at: string | null;
  last_login_at: string | null;
  is_admin: boolean;
  reliability_no_shows: number;
  matches_played: number;
  matches_created: number;
};

export type AdminMatchRow = {
  id: string;
  sport: string;
  status: string;
  confirmation_state: string | null;
  team_a_name: string;
  team_b_name: string;
  created_by: string | null;
  creator_name: string;
  scored_by: string | null;
  scorer_name: string;
  player_count: number;
  created_at: string;
  played_at: string | null;
};

export type AdminOverview = {
  totalUsers: number;
  activeToday: number;
  loginsToday: number;
  matchesCreatedToday: number;
  matchesCompletedToday: number;
  eventsCreatedToday: number;
  pickupsCreatedToday: number;
  adminQueueCount: number;
  recentAudit: AdminAuditEvent[];
  recentMatches: AdminMatchRow[];
};
