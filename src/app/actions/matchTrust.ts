'use server';

import { revalidatePath } from 'next/cache';
import { getServerAuth } from '@/lib/supabase/server';
import { CACHE_TAG_LEADERBOARD, revalidateCacheTag } from '@/lib/cache/tags';
import { writeAuditEvent } from '@/features/admin/audit';

/**
 * Server actions for the match-trust workflow (migration 013).
 *
 * Why server actions instead of direct supabase calls from the client:
 *   • One enforcement point — auth + admin checks live here, not scattered
 *     across components.
 *   • Easier to revalidate the right pages after each mutation.
 *   • Future hardening (rate-limits, audit logs) only touches this file.
 *
 * Auth model:
 *   • confirm/dispute  — only the participant themselves
 *   • forcePush        — only the scorer of the match
 *   • approve/reject   — only profiles.is_admin = true
 */

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireUser() {
  const { supabase, user } = await getServerAuth();
  if (!user) return { supabase, user: null as null, error: 'Not signed in' };
  return { supabase, user, error: null };
}

async function isAdmin(): Promise<boolean> {
  const { supabase, user } = await requireUser();
  if (!user) return false;
  const { data } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  return !!data?.is_admin;
}

// ── Participant actions ─────────────────────────────────────────────────────

export async function confirmMatch(matchId: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (error || !user) return { ok: false, error: error ?? 'Not signed in' };

  const { error: upsertErr } = await supabase
    .from('match_confirmations')
    .upsert({
      match_id: matchId,
      player_id: user.id,
      status: 'confirmed',
      disputed_reason: null,
      responded_at: new Date().toISOString(),
    }, { onConflict: 'match_id,player_id' });

  if (upsertErr) return { ok: false, error: upsertErr.message };

  await writeAuditEvent(supabase, {
    actorUserId: user.id,
    eventType: 'match_confirmed',
    entityType: 'match',
    entityId: matchId,
  });

  await supabase
    .from('user_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('match_id', matchId)
    .is('read_at', null);

  revalidatePath(`/matches/${matchId}`);
  revalidatePath('/dashboard');
  revalidatePath('/notifications');
  revalidatePath('/', 'layout');
  revalidatePath('/leaderboard');
  revalidateCacheTag(CACHE_TAG_LEADERBOARD);
  return { ok: true };
}

export async function disputeMatch(matchId: string, reason: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (error || !user) return { ok: false, error: error ?? 'Not signed in' };

  const { error: upsertErr } = await supabase
    .from('match_confirmations')
    .upsert({
      match_id: matchId,
      player_id: user.id,
      status: 'disputed',
      disputed_reason: reason || null,
      responded_at: new Date().toISOString(),
    }, { onConflict: 'match_id,player_id' });

  if (upsertErr) return { ok: false, error: upsertErr.message };

  await writeAuditEvent(supabase, {
    actorUserId: user.id,
    eventType: 'match_disputed',
    entityType: 'match',
    entityId: matchId,
    metadata: { reason: reason || null },
  });

  await supabase
    .from('user_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('match_id', matchId)
    .is('read_at', null);

  revalidatePath(`/matches/${matchId}`);
  revalidatePath('/dashboard');
  revalidatePath('/notifications');
  revalidatePath('/', 'layout');
  revalidatePath('/leaderboard');
  revalidateCacheTag(CACHE_TAG_LEADERBOARD);
  return { ok: true };
}

// ── Scorer action ───────────────────────────────────────────────────────────

export async function forcePushMatch(matchId: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (error || !user) return { ok: false, error: error ?? 'Not signed in' };

  // Verify caller is the scorer
  const { data: m } = await supabase
    .from('matches')
    .select('scored_by, created_by, confirmation_state')
    .eq('id', matchId)
    .single();
  if (!m) return { ok: false, error: 'Match not found' };
  const scorerId = m.scored_by ?? m.created_by;
  if (scorerId !== user.id) return { ok: false, error: 'Only the scorer can force-push' };
  if (m.confirmation_state !== 'disputed') {
    return { ok: false, error: 'Only disputed matches can be force-pushed' };
  }

  const { error: updErr } = await supabase
    .from('matches')
    .update({ confirmation_state: 'force_pushed' })
    .eq('id', matchId);
  if (updErr) return { ok: false, error: updErr.message };

  await writeAuditEvent(supabase, {
    actorUserId: user.id,
    eventType: 'match_force_pushed',
    entityType: 'match',
    entityId: matchId,
  });

  revalidatePath(`/matches/${matchId}`);
  revalidatePath('/admin/matches');
  revalidatePath('/leaderboard');
  revalidateCacheTag(CACHE_TAG_LEADERBOARD);
  return { ok: true };
}

// ── Admin actions ───────────────────────────────────────────────────────────

export async function approveMatch(matchId: string, notes?: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (error || !user) return { ok: false, error: error ?? 'Not signed in' };
  if (!(await isAdmin())) return { ok: false, error: 'Admin only' };

  // Two writes: state → confirmed, audit row inserted.
  const [{ error: stateErr }, { error: logErr }] = await Promise.all([
    supabase.from('matches').update({ confirmation_state: 'confirmed' }).eq('id', matchId),
    supabase.from('match_admin_actions').insert({
      match_id: matchId, admin_id: user.id, action: 'approve', notes: notes ?? null,
    }),
  ]);
  if (stateErr) return { ok: false, error: stateErr.message };
  if (logErr) return { ok: false, error: logErr.message };

  await writeAuditEvent(supabase, {
    actorUserId: user.id,
    eventType: 'match_admin_approved',
    entityType: 'match',
    entityId: matchId,
    metadata: { notes: notes ?? null },
  });

  // Resolve any still-pending participant rows so the audit looks clean.
  await supabase
    .from('match_confirmations')
    .update({ status: 'confirmed', responded_at: new Date().toISOString() })
    .eq('match_id', matchId)
    .neq('status', 'confirmed');

  revalidatePath('/admin/matches');
  revalidatePath(`/matches/${matchId}`);
  revalidatePath('/dashboard');
  revalidatePath('/leaderboard');
  revalidateCacheTag(CACHE_TAG_LEADERBOARD);
  return { ok: true };
}

export async function rejectMatch(matchId: string, notes?: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (error || !user) return { ok: false, error: error ?? 'Not signed in' };
  if (!(await isAdmin())) return { ok: false, error: 'Admin only' };

  const [{ error: stateErr }, { error: logErr }] = await Promise.all([
    supabase.from('matches').update({ confirmation_state: 'rejected' }).eq('id', matchId),
    supabase.from('match_admin_actions').insert({
      match_id: matchId, admin_id: user.id, action: 'reject', notes: notes ?? null,
    }),
  ]);
  if (stateErr) return { ok: false, error: stateErr.message };
  if (logErr) return { ok: false, error: logErr.message };

  await writeAuditEvent(supabase, {
    actorUserId: user.id,
    eventType: 'match_admin_rejected',
    entityType: 'match',
    entityId: matchId,
    metadata: { notes: notes ?? null },
  });

  revalidatePath('/admin/matches');
  revalidatePath(`/matches/${matchId}`);
  // Stat pages need to drop this match from aggregates.
  revalidatePath('/dashboard');
  revalidatePath('/leaderboard');
  revalidateCacheTag(CACHE_TAG_LEADERBOARD);
  return { ok: true };
}

/** Permanently remove a match and all dependent rows (CASCADE). Admin only, completed matches only. */
export async function deleteMatchAsAdmin(matchId: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (error || !user) return { ok: false, error: error ?? 'Not signed in' };
  if (!(await isAdmin())) return { ok: false, error: 'Admin only' };

  const { data: m } = await supabase.from('matches').select('status').eq('id', matchId).single();
  if (!m) return { ok: false, error: 'Match not found' };
  if (m.status !== 'completed') {
    return { ok: false, error: 'You can only delete a match after it has ended (completed).' };
  }

  const { error: delErr } = await supabase.from('matches').delete().eq('id', matchId);
  if (delErr) return { ok: false, error: delErr.message };

  await writeAuditEvent(supabase, {
    actorUserId: user.id,
    eventType: 'match_admin_deleted',
    entityType: 'match',
    entityId: matchId,
  });

  revalidatePath('/matches');
  revalidatePath('/admin/matches');
  revalidatePath('/dashboard');
  revalidatePath('/leaderboard');
  revalidatePath('/players');
  revalidatePath('/profile');
  revalidateCacheTag(CACHE_TAG_LEADERBOARD);
  return { ok: true };
}
