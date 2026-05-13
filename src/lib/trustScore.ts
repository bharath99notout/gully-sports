export interface PlayerTrustScore {
  player_id: string;
  score: number;
  tier: string;
  attendance_score: number;
  cancellation_score: number;
  payment_score: number;
  peer_score: number;
  skill_score: number;
  matches_counted: number;
  attendance_events: number;
  pickup_commitment_events: number;
  payment_assignments: number;
  peer_ratings_count: number;
  no_shows: number;
  cancellations: number;
  low_data: boolean;
}

export const DEFAULT_TRUST_SCORE: Omit<PlayerTrustScore, 'player_id'> = {
  score: 60,
  tier: 'Reliable',
  attendance_score: 60,
  cancellation_score: 60,
  payment_score: 60,
  peer_score: 60,
  skill_score: 60,
  matches_counted: 0,
  attendance_events: 0,
  pickup_commitment_events: 0,
  payment_assignments: 0,
  peer_ratings_count: 0,
  no_shows: 0,
  cancellations: 0,
  low_data: true,
};

export function fallbackTrustScore(playerId: string): PlayerTrustScore {
  return { player_id: playerId, ...DEFAULT_TRUST_SCORE };
}

export function getTrustTier(score: number): string {
  if (score >= 90) return 'Elite Reliable';
  if (score >= 75) return 'Highly Reliable';
  if (score >= 60) return 'Reliable';
  if (score >= 40) return 'Building Trust';
  return 'Limited Access';
}

export function getTrustTone(score: number): {
  text: string;
  border: string;
  bg: string;
  bar: string;
} {
  if (score >= 90) return {
    text: 'text-emerald-300',
    border: 'border-emerald-700/70',
    bg: 'bg-emerald-950/35',
    bar: 'bg-emerald-400',
  };
  if (score >= 75) return {
    text: 'text-cyan-300',
    border: 'border-cyan-800/70',
    bg: 'bg-cyan-950/30',
    bar: 'bg-cyan-400',
  };
  if (score >= 60) return {
    text: 'text-blue-300',
    border: 'border-blue-800/70',
    bg: 'bg-blue-950/30',
    bar: 'bg-blue-400',
  };
  if (score >= 40) return {
    text: 'text-amber-300',
    border: 'border-amber-800/70',
    bg: 'bg-amber-950/30',
    bar: 'bg-amber-400',
  };
  return {
    text: 'text-red-300',
    border: 'border-red-800/70',
    bg: 'bg-red-950/30',
    bar: 'bg-red-400',
  };
}

export function normalizeTrustScore(
  playerId: string,
  row: Partial<PlayerTrustScore> | null | undefined,
): PlayerTrustScore {
  if (!row) return fallbackTrustScore(playerId);
  const score = typeof row.score === 'number' && Number.isFinite(row.score)
    ? row.score
    : DEFAULT_TRUST_SCORE.score;
  return {
    player_id: row.player_id ?? playerId,
    score,
    tier: row.tier ?? getTrustTier(score),
    attendance_score: row.attendance_score ?? DEFAULT_TRUST_SCORE.attendance_score,
    cancellation_score: row.cancellation_score ?? DEFAULT_TRUST_SCORE.cancellation_score,
    payment_score: row.payment_score ?? DEFAULT_TRUST_SCORE.payment_score,
    peer_score: row.peer_score ?? DEFAULT_TRUST_SCORE.peer_score,
    skill_score: row.skill_score ?? DEFAULT_TRUST_SCORE.skill_score,
    matches_counted: row.matches_counted ?? DEFAULT_TRUST_SCORE.matches_counted,
    attendance_events: row.attendance_events ?? DEFAULT_TRUST_SCORE.attendance_events,
    pickup_commitment_events: row.pickup_commitment_events ?? DEFAULT_TRUST_SCORE.pickup_commitment_events,
    payment_assignments: row.payment_assignments ?? DEFAULT_TRUST_SCORE.payment_assignments,
    peer_ratings_count: row.peer_ratings_count ?? DEFAULT_TRUST_SCORE.peer_ratings_count,
    no_shows: row.no_shows ?? DEFAULT_TRUST_SCORE.no_shows,
    cancellations: row.cancellations ?? DEFAULT_TRUST_SCORE.cancellations,
    low_data: row.low_data ?? DEFAULT_TRUST_SCORE.low_data,
  };
}
