import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from './supabase/server';
import {
  fallbackTrustScore,
  normalizeTrustScore,
  type PlayerTrustScore,
} from './trustScore';

const TRUST_SELECT = `
  player_id, score, tier,
  attendance_score, cancellation_score, payment_score, peer_score, skill_score,
  matches_counted, attendance_events, pickup_commitment_events,
  payment_assignments, peer_ratings_count, no_shows, cancellations, low_data
`;

export async function getTrustScoreForPlayer(
  playerId: string,
  supabaseClient?: SupabaseClient,
): Promise<PlayerTrustScore> {
  const scores = await getTrustScoresForPlayers([playerId], supabaseClient);
  return scores.get(playerId) ?? fallbackTrustScore(playerId);
}

export async function getTrustScoresForPlayers(
  playerIds: string[],
  supabaseClient?: SupabaseClient,
): Promise<Map<string, PlayerTrustScore>> {
  const ids = [...new Set(playerIds.filter(Boolean))];
  const out = new Map<string, PlayerTrustScore>();
  for (const id of ids) out.set(id, fallbackTrustScore(id));
  if (ids.length === 0) return out;

  const supabase = supabaseClient ?? (await createClient());
  const { data, error } = await supabase
    .from('player_trust_scores')
    .select(TRUST_SELECT)
    .in('player_id', ids);

  if (error || !data) {
    // The migration may not be applied in a local/staging DB yet. Keep pages
    // usable with a neutral score instead of failing profile rendering.
    if (error) console.warn('[trustScore] read failed', error.message);
    return out;
  }

  for (const row of data as unknown as PlayerTrustScore[]) {
    out.set(row.player_id, normalizeTrustScore(row.player_id, row));
  }
  return out;
}
