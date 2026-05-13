'use server';

import { revalidatePath } from 'next/cache';
import { getServerAuth } from '@/lib/supabase/server';
import { CACHE_TAG_PICKUPS, revalidateCacheTag } from '@/lib/cache/tags';
import type { SportType } from '@/types';

/**
 * Server actions for the "Need Players Now" feature.
 *
 * Phase MVP: create / cancel pickups, request to join, host approve/decline,
 * joiner withdraw. Push fan-out lives in a separate module (V1).
 */

type ActionResult<T = void> =
  | { ok: true; data: T extends void ? undefined : T }
  | { ok: false; error: string };

async function requireUser() {
  const { supabase, user } = await getServerAuth();
  if (!user) return { supabase, user: null as null, error: 'Sign in to continue' };
  return { supabase, user, error: null };
}

// ── Create pickup ───────────────────────────────────────────────────────────

export interface CreatePickupInput {
  sport: SportType;
  ground_name: string;
  ground_lat: number;
  ground_lng: number;
  slots_total: number;
  format?: string;
  notes?: string;
  start_time: string;          // ISO
  expires_at?: string | null;  // ISO; default = start_time + 2h
}

const MAX_OPEN_HOSTED = 3;

export async function createPickup(
  input: CreatePickupInput,
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Not signed in' };

  if (!input.ground_name?.trim()) return { ok: false, error: 'Ground name is required' };
  if (!Number.isFinite(input.ground_lat) || !Number.isFinite(input.ground_lng)) {
    return { ok: false, error: 'Location is required' };
  }
  if (!input.slots_total || input.slots_total < 1 || input.slots_total > 15) {
    return { ok: false, error: 'Slots must be 1–15' };
  }
  if (!input.start_time) return { ok: false, error: 'Start time is required' };

  const startMs = new Date(input.start_time).getTime();
  if (!Number.isFinite(startMs)) return { ok: false, error: 'Invalid start time' };
  const now = Date.now();
  if (startMs < now - 5 * 60 * 1000) {
    return { ok: false, error: 'Start time must be now or in the future' };
  }
  if (startMs > now + 60 * 24 * 60 * 60 * 1000) {
    return { ok: false, error: 'Start time can be at most 60 days ahead' };
  }

  // Anti-spam: cap concurrent open pings per host.
  const { count } = await supabase
    .from('pickup_requests')
    .select('id', { count: 'exact', head: true })
    .eq('host_id', user.id)
    .eq('status', 'open');
  if ((count ?? 0) >= MAX_OPEN_HOSTED) {
    return { ok: false, error: `You can only have ${MAX_OPEN_HOSTED} open pickups at a time. Cancel one first.` };
  }

  // Listing auto-closes a few hours after scheduled start (not 2h after post).
  const expiresAt =
    input.expires_at
    ?? new Date(new Date(input.start_time).getTime() + 4 * 60 * 60 * 1000).toISOString();

  const { data, error: insertErr } = await supabase
    .from('pickup_requests')
    .insert({
      host_id:      user.id,
      sport:        input.sport,
      ground_name:  input.ground_name.trim(),
      ground_lat:   input.ground_lat,
      ground_lng:   input.ground_lng,
      slots_total:  input.slots_total,
      format:       input.format?.trim() || null,
      notes:        input.notes?.trim() || null,
      start_time:   input.start_time,
      expires_at:   expiresAt,
    })
    .select('id')
    .single();
  if (insertErr || !data) return { ok: false, error: insertErr?.message ?? 'Failed to create pickup' };

  revalidatePath('/pickups');
  revalidatePath('/dashboard');
  revalidateCacheTag(CACHE_TAG_PICKUPS);

  // Fire push fan-out asynchronously — don't make the host wait.
  // We import dynamically because `web-push` is Node-only and we want
  // the rest of this server-action module to stay edge-compatible if it's
  // ever lifted there (it isn't right now, but cheap insurance).
  (async () => {
    try {
      const { fanOutPickupPing } = await import('@/lib/push');
      await fanOutPickupPing(data.id);
    } catch (e) {
      console.error('[pickups] push fan-out failed', e);
    }
  })();

  return { ok: true, data: { id: data.id } };
}

// ── Cancel pickup (host) ────────────────────────────────────────────────────

export async function cancelPickup(id: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Not signed in' };

  const { error: updErr } = await supabase
    .from('pickup_requests')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('host_id', user.id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath('/pickups');
  revalidatePath(`/pickups/${id}`);
  revalidatePath('/dashboard');
  revalidateCacheTag(CACHE_TAG_PICKUPS);
  return { ok: true, data: undefined };
}

// ── Request to join (joiner) ────────────────────────────────────────────────

export async function requestToJoin(requestId: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Not signed in' };

  // Block joining own pickup.
  const { data: req } = await supabase
    .from('pickup_requests')
    .select('host_id, status, slots_total')
    .eq('id', requestId)
    .single();
  if (!req) return { ok: false, error: 'Pickup not found' };
  if (req.host_id === user.id) return { ok: false, error: 'You can\'t join your own pickup' };
  if (req.status !== 'open') return { ok: false, error: 'This pickup is no longer open' };

  // Idempotent: re-asking after a 'declined'/'withdrew' refreshes the row.
  const { error: upsertErr } = await supabase
    .from('pickup_responses')
    .upsert(
      { request_id: requestId, joiner_id: user.id, status: 'requested', decided_at: null },
      { onConflict: 'request_id,joiner_id' },
    );
  if (upsertErr) return { ok: false, error: upsertErr.message };

  // Push the host so they know someone wants to join.
  (async () => {
    try {
      const { sendToUser } = await import('@/lib/push');
      const { data: joiner } = await supabase
        .from('profiles').select('name').eq('id', user.id).single();
      await sendToUser(req.host_id, {
        title: `🙋 ${joiner?.name ?? 'A player'} wants to join`,
        body:  'Tap to approve or decline.',
        url:   `/pickups/${requestId}`,
        tag:   `pickup-join-${requestId}-${user.id}`,
      });
    } catch (e) {
      console.error('[pickups] notify host failed', e);
    }
  })();

  revalidatePath(`/pickups/${requestId}`);
  revalidatePath('/pickups');
  revalidateCacheTag(CACHE_TAG_PICKUPS);
  return { ok: true, data: undefined };
}

// ── Withdraw (joiner) ───────────────────────────────────────────────────────

export async function withdrawResponse(requestId: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Not signed in' };

  const { error: updErr } = await supabase
    .from('pickup_responses')
    .update({ status: 'withdrew', decided_at: new Date().toISOString() })
    .eq('request_id', requestId)
    .eq('joiner_id', user.id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath(`/pickups/${requestId}`);
  revalidatePath('/pickups');
  revalidateCacheTag(CACHE_TAG_PICKUPS);
  return { ok: true, data: undefined };
}

// ── Host decide (approve / decline) ─────────────────────────────────────────

export async function decideResponse(
  responseId: string,
  decision: 'accepted' | 'declined',
): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Not signed in' };

  // Verify host owns the parent request before approving/declining.
  const { data: row } = await supabase
    .from('pickup_responses')
    .select('request_id, pickup_requests!inner(host_id, slots_total, status)')
    .eq('id', responseId)
    .single();
  if (!row) return { ok: false, error: 'Response not found' };
  // Supabase returns the joined relation as object-or-array; normalize.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parent = Array.isArray((row as any).pickup_requests) ? (row as any).pickup_requests[0] : (row as any).pickup_requests;
  if (!parent || parent.host_id !== user.id) return { ok: false, error: 'Not the host' };
  if (parent.status !== 'open') return { ok: false, error: 'Pickup is no longer open' };

  const { error: updErr } = await supabase
    .from('pickup_responses')
    .update({ status: decision, decided_at: new Date().toISOString() })
    .eq('id', responseId);
  if (updErr) return { ok: false, error: updErr.message };

  // If we just hit slot capacity, auto-flip the request to filled.
  if (decision === 'accepted') {
    const { count: acceptedCount } = await supabase
      .from('pickup_responses')
      .select('id', { count: 'exact', head: true })
      .eq('request_id', row.request_id)
      .eq('status', 'accepted');
    if ((acceptedCount ?? 0) >= parent.slots_total) {
      await supabase
        .from('pickup_requests')
        .update({ status: 'filled' })
        .eq('id', row.request_id);
    }
  }

  // Notify joiner of the decision.
  (async () => {
    try {
      const { sendToUser } = await import('@/lib/push');
      const { data: joinerRow } = await supabase
        .from('pickup_responses').select('joiner_id').eq('id', responseId).single();
      if (joinerRow) {
        const accepted = decision === 'accepted';
        await sendToUser(joinerRow.joiner_id, {
          title: accepted ? '✓ You\'re in!' : 'Host filled the slot',
          body:  accepted ? 'Tap to coordinate with the host.' : 'Try another pickup nearby.',
          url:   `/pickups/${row.request_id}`,
          tag:   `pickup-decision-${row.request_id}-${joinerRow.joiner_id}`,
        });
      }
    } catch (e) {
      console.error('[pickups] notify joiner failed', e);
    }
  })();

  revalidatePath(`/pickups/${row.request_id}`);
  revalidatePath('/pickups');
  revalidateCacheTag(CACHE_TAG_PICKUPS);
  return { ok: true, data: undefined };
}

// ── Post-match: mark show / no-show (host) ──────────────────────────────────

export async function markAttendance(
  responseId: string,
  attended: boolean,
): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Not signed in' };

  // Host check
  const { data: row } = await supabase
    .from('pickup_responses')
    .select('id, joiner_id, request_id, pickup_requests!inner(host_id)')
    .eq('id', responseId)
    .single();
  if (!row) return { ok: false, error: 'Response not found' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parent = Array.isArray((row as any).pickup_requests) ? (row as any).pickup_requests[0] : (row as any).pickup_requests;
  if (!parent || parent.host_id !== user.id) return { ok: false, error: 'Not the host' };

  const newStatus = attended ? 'showed_up' : 'no_show';
  const { error: updErr } = await supabase
    .from('pickup_responses')
    .update({ status: newStatus, decided_at: new Date().toISOString() })
    .eq('id', responseId);
  if (updErr) return { ok: false, error: updErr.message };

  // V2: roll up no_show count on the joiner's profile (soft reliability).
  if (!attended) {
    // Best-effort increment — failure here doesn't fail the action.
    await supabase.rpc('increment_no_show', { p_user_id: row.joiner_id }).then(() => {}, () => {});
  }

  revalidatePath(`/pickups/${row.request_id}`);
  revalidatePath('/pickups');
  revalidateCacheTag(CACHE_TAG_PICKUPS);
  return { ok: true, data: undefined };
}
