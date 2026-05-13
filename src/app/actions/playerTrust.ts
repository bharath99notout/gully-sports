'use server';

import { revalidatePath } from 'next/cache';
import { getServerAuth } from '@/lib/supabase/server';

type ActionResult = { ok: true } | { ok: false; error: string };

export async function rateMatchPlayer(
  matchId: string,
  playerId: string,
  rating: number,
): Promise<ActionResult> {
  const { supabase, user } = await getServerAuth();
  if (!user) return { ok: false, error: 'Sign in to rate players' };

  const safeRating = Math.trunc(rating);
  if (safeRating < 1 || safeRating > 5) {
    return { ok: false, error: 'Rating must be between 1 and 5' };
  }
  if (playerId === user.id) {
    return { ok: false, error: 'You cannot rate yourself' };
  }

  const [{ data: match }, { data: roster }] = await Promise.all([
    supabase
      .from('matches')
      .select('id, status, confirmation_state')
      .eq('id', matchId)
      .single(),
    supabase
      .from('match_players')
      .select('player_id')
      .eq('match_id', matchId)
      .in('player_id', [user.id, playerId]),
  ]);

  if (!match) return { ok: false, error: 'Match not found' };
  if (match.status !== 'completed' || match.confirmation_state !== 'confirmed') {
    return { ok: false, error: 'Ratings open only after the match is confirmed' };
  }

  const rosterIds = new Set((roster ?? []).map(r => r.player_id));
  if (!rosterIds.has(user.id) || !rosterIds.has(playerId)) {
    return { ok: false, error: 'Both players must be in this match' };
  }

  const { error } = await supabase
    .from('player_peer_ratings')
    .upsert({
      match_id: matchId,
      reviewer_id: user.id,
      player_id: playerId,
      rating: safeRating,
    }, { onConflict: 'match_id,reviewer_id,player_id' });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/players/${playerId}`);
  revalidatePath(`/p/${playerId}`);
  revalidatePath('/players');
  return { ok: true };
}
