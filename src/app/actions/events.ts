'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { SportType, EventStatus } from '@/types';

/**
 * Server actions for events (Phase 1 chunk 1).
 *
 * Why server actions:
 *   - Single auth-checked entry point per mutation
 *   - Centralised revalidatePath so list + detail stay fresh
 *   - Future hardening (rate limiting, anti-spam) edits one file
 */

type ActionResult<T = void> =
  | { ok: true; data: T extends void ? undefined : T }
  | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null as null, error: 'Sign in to continue' };
  return { supabase, user, error: null };
}

// ── Create ──────────────────────────────────────────────────────────────────

export interface CreateEventInput {
  name: string;
  sport: SportType;
  start_at: string;       // ISO
  end_at?: string | null;
  venue_name?: string | null;
  venue_map_url?: string | null;
  capacity?: number | null;
  description?: string | null;
  invite_only?: boolean;
  recruiting?: boolean;
  rsvp_cutoff_at?: string | null;
  tournament_id?: string | null;
}

export async function createEvent(input: CreateEventInput): Promise<ActionResult<{ id: string }>> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Not signed in' };

  const trimmedName = input.name.trim();
  if (!trimmedName) return { ok: false, error: 'Event name is required' };
  if (!input.start_at) return { ok: false, error: 'Start time is required' };

  const { data, error: insertErr } = await supabase
    .from('events')
    .insert({
      name: trimmedName,
      sport: input.sport,
      host_id: user.id,
      start_at: input.start_at,
      end_at: input.end_at ?? null,
      venue_name: input.venue_name?.trim() || null,
      venue_map_url: input.venue_map_url?.trim() || null,
      capacity: input.capacity ?? null,
      description: input.description?.trim() || null,
      invite_only: input.invite_only ?? false,
      recruiting: input.recruiting ?? false,
      rsvp_cutoff_at: input.rsvp_cutoff_at ?? null,
      tournament_id: input.tournament_id ?? null,
    })
    .select('id')
    .single();
  if (insertErr || !data) return { ok: false, error: insertErr?.message ?? 'Could not create event' };

  revalidatePath('/events');
  return { ok: true, data: { id: data.id } };
}

// ── Update ──────────────────────────────────────────────────────────────────

export type UpdateEventInput = Partial<Omit<CreateEventInput, 'sport'>>;

export async function updateEvent(eventId: string, patch: UpdateEventInput): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Not signed in' };

  const cleaned: Record<string, unknown> = {};
  if (patch.name !== undefined) cleaned.name = patch.name.trim();
  if (patch.start_at !== undefined) cleaned.start_at = patch.start_at;
  if (patch.end_at !== undefined) cleaned.end_at = patch.end_at;
  if (patch.venue_name !== undefined) cleaned.venue_name = patch.venue_name?.trim() || null;
  if (patch.venue_map_url !== undefined) cleaned.venue_map_url = patch.venue_map_url?.trim() || null;
  if (patch.capacity !== undefined) cleaned.capacity = patch.capacity;
  if (patch.description !== undefined) cleaned.description = patch.description?.trim() || null;
  if (patch.invite_only !== undefined) cleaned.invite_only = patch.invite_only;
  if (patch.recruiting !== undefined) cleaned.recruiting = patch.recruiting;
  if (patch.rsvp_cutoff_at !== undefined) cleaned.rsvp_cutoff_at = patch.rsvp_cutoff_at;
  if (patch.tournament_id !== undefined) cleaned.tournament_id = patch.tournament_id;

  // RLS already enforces host-only updates; the explicit eq is defence-in-depth.
  const { error: updErr } = await supabase
    .from('events')
    .update(cleaned)
    .eq('id', eventId)
    .eq('host_id', user.id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath('/events');
  revalidatePath(`/events/${eventId}`);
  return { ok: true, data: undefined };
}

// ── Cancel ──────────────────────────────────────────────────────────────────

export async function cancelEvent(eventId: string, reason?: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Not signed in' };

  const patch: { status: EventStatus; cancellation_reason: string | null } = {
    status: 'cancelled',
    cancellation_reason: reason?.trim() || null,
  };

  const { error: updErr } = await supabase
    .from('events')
    .update(patch)
    .eq('id', eventId)
    .eq('host_id', user.id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath('/events');
  revalidatePath(`/events/${eventId}`);
  return { ok: true, data: undefined };
}

// ── Hard delete ─────────────────────────────────────────────────────────────

/**
 * Permanently remove the event and everything that hangs off it (RSVPs,
 * costs, items, assignments, invites, event_matches join rows). All those
 * tables FK to events.id with ON DELETE CASCADE, so a single delete here
 * cleans up the lot.
 *
 * Important: matches that were *linked* to this event are NOT deleted —
 * event_matches is just a join table, removing its row leaves the match
 * untouched. That's deliberate: career stats and the match scorecard
 * survive event deletion. Use the admin "delete match" path if you need
 * to remove a match entirely.
 *
 * Hosts often want "cancel" not "delete" — cancel preserves the audit
 * trail. Delete is for accidental creations / spam / test events.
 */
export async function deleteEvent(eventId: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Not signed in' };

  // Defence-in-depth host check; RLS rejects non-host deletes anyway.
  const { data: event } = await supabase
    .from('events').select('host_id').eq('id', eventId).maybeSingle();
  if (!event) return { ok: false, error: 'Event not found' };
  if (event.host_id !== user.id) {
    return { ok: false, error: 'Only the host can delete this event' };
  }

  const { error: delErr } = await supabase
    .from('events').delete().eq('id', eventId).eq('host_id', user.id);
  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath('/events');
  return { ok: true, data: undefined };
}

// (createEventFromForm removed — the New Event page now uses the typed
// `createEvent` action directly so it can convert datetime-local→UTC on
// the client before submit.)

// ── RSVP (signed-in user) ───────────────────────────────────────────────────

type RsvpStatus = 'going' | 'maybe' | 'not_going';

/**
 * Self-RSVP for a signed-in player. Capacity-aware: if `going` would push the
 * confirmed list past the cap, demote to `waitlist` instead. We do this with
 * a single read+write rather than a SELECT FOR UPDATE because the worst-case
 * race is "two people land on the last seat" — they both succeed at the DB
 * level (UNIQUE is per player), and the next page render shows one of them
 * promoted to waitlist on next sync. Acceptable for v1.
 */
export async function rsvpToEvent(eventId: string, status: RsvpStatus): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Sign in to RSVP' };

  // Look up event for capacity + invite_only enforcement.
  const { data: event } = await supabase
    .from('events')
    .select('id, capacity, invite_only, status, host_id, rsvp_cutoff_at')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return { ok: false, error: 'Event not found' };
  if (event.status === 'cancelled') return { ok: false, error: 'Event was cancelled' };
  if (event.rsvp_cutoff_at && new Date(event.rsvp_cutoff_at) < new Date()) {
    return { ok: false, error: 'RSVPs are closed for this event' };
  }

  // Invite-only enforcement: phone must be on the allowlist (host always exempt).
  if (event.invite_only && event.host_id !== user.id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', user.id)
      .maybeSingle();
    const phone10 = (profile?.phone ?? '').replace(/\D/g, '').slice(-10);
    if (!phone10) return { ok: false, error: 'Add a phone number to your profile to RSVP' };
    const { data: invite } = await supabase
      .from('event_invites')
      .select('phone')
      .eq('event_id', eventId)
      .eq('phone', phone10)
      .maybeSingle();
    if (!invite) return { ok: false, error: 'This event is invite-only' };
  }

  let finalStatus: 'going' | 'maybe' | 'not_going' | 'waitlist' = status;
  if (status === 'going' && event.capacity != null) {
    const { count } = await supabase
      .from('event_rsvps')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'going');
    if ((count ?? 0) >= event.capacity) finalStatus = 'waitlist';
  }

  const { error: upsertErr } = await supabase
    .from('event_rsvps')
    .upsert({
      event_id: eventId,
      player_id: user.id,
      status: finalStatus,
      responded_at: new Date().toISOString(),
    }, { onConflict: 'event_id,player_id' });
  if (upsertErr) return { ok: false, error: upsertErr.message };

  revalidatePath(`/events/${eventId}`);
  revalidatePath('/events');
  return { ok: true, data: undefined };
}

// ── Edit capacity (host) — auto-demotes overflow to waitlist ────────────────

export async function setEventCapacity(eventId: string, newCapacity: number | null): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Not signed in' };

  // Confirm host.
  const { data: event } = await supabase
    .from('events')
    .select('host_id')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return { ok: false, error: 'Event not found' };
  if (event.host_id !== user.id) return { ok: false, error: 'Only the host can edit capacity' };

  // Update the cap first so the demotion calculation reads the new value.
  const { error: updErr } = await supabase
    .from('events')
    .update({ capacity: newCapacity })
    .eq('id', eventId);
  if (updErr) return { ok: false, error: updErr.message };

  if (newCapacity != null) {
    // Demote the most-recently-confirmed RSVPs that exceed the new cap.
    const { data: confirmed } = await supabase
      .from('event_rsvps')
      .select('id, responded_at')
      .eq('event_id', eventId)
      .eq('status', 'going')
      .order('responded_at', { ascending: false }); // newest first → first to demote
    const toDemote = (confirmed ?? []).slice(0, Math.max(0, (confirmed?.length ?? 0) - newCapacity));
    if (toDemote.length > 0) {
      await supabase
        .from('event_rsvps')
        .update({ status: 'waitlist' })
        .in('id', toDemote.map(r => r.id));
    }
  } else {
    // Cap removed — promote all waitlist back to going.
    await supabase
      .from('event_rsvps')
      .update({ status: 'going' })
      .eq('event_id', eventId)
      .eq('status', 'waitlist');
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true, data: undefined };
}

// ── Promote next waitlist on someone dropping out ──────────────────────────

async function promoteNextWaitlist(supabase: Awaited<ReturnType<typeof createClient>>, eventId: string) {
  const { data: event } = await supabase
    .from('events').select('capacity').eq('id', eventId).maybeSingle();
  if (!event?.capacity) return;
  const { count: confirmedCount } = await supabase
    .from('event_rsvps')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId).eq('status', 'going');
  const slots = event.capacity - (confirmedCount ?? 0);
  if (slots <= 0) return;
  const { data: waitlist } = await supabase
    .from('event_rsvps')
    .select('id, responded_at')
    .eq('event_id', eventId)
    .eq('status', 'waitlist')
    .order('responded_at', { ascending: true }) // oldest first
    .limit(slots);
  if (!waitlist || waitlist.length === 0) return;
  await supabase
    .from('event_rsvps')
    .update({ status: 'going' })
    .in('id', waitlist.map(r => r.id));
}

// ── Drop self (cancel own RSVP) — promotes the next waitlist ───────────────

export async function dropOwnRsvp(eventId: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Not signed in' };
  const { error: delErr } = await supabase
    .from('event_rsvps')
    .delete()
    .eq('event_id', eventId)
    .eq('player_id', user.id);
  if (delErr) return { ok: false, error: delErr.message };
  await promoteNextWaitlist(supabase, eventId);
  revalidatePath(`/events/${eventId}`);
  return { ok: true, data: undefined };
}

// ── Invites (host) ──────────────────────────────────────────────────────────

export async function addEventInvite(eventId: string, rawPhone: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Not signed in' };
  const phone10 = rawPhone.replace(/\D/g, '').slice(-10);
  if (phone10.length !== 10) return { ok: false, error: 'Phone must be 10 digits' };

  const { error: insertErr } = await supabase
    .from('event_invites')
    .insert({ event_id: eventId, phone: phone10, invited_by: user.id });
  if (insertErr && !insertErr.message.includes('duplicate')) {
    return { ok: false, error: insertErr.message };
  }
  revalidatePath(`/events/${eventId}`);
  return { ok: true, data: undefined };
}

export async function removeEventInvite(eventId: string, phone: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Not signed in' };
  const { error: delErr } = await supabase
    .from('event_invites')
    .delete()
    .eq('event_id', eventId)
    .eq('phone', phone);
  if (delErr) return { ok: false, error: delErr.message };
  revalidatePath(`/events/${eventId}`);
  return { ok: true, data: undefined };
}


// ── Attendance + cost split (host) ──────────────────────────────────────────

export async function setRsvpAttended(rsvpId: string, attended: boolean): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Not signed in' };
  // RLS allows host to update any rsvp on their event.
  const { error: updErr } = await supabase
    .from('event_rsvps')
    .update({ attended })
    .eq('id', rsvpId);
  if (updErr) return { ok: false, error: updErr.message };
  return { ok: true, data: undefined };
}

interface SaveCostInput {
  total_amount_paise: number;
  notes?: string | null;
}

/**
 * Save cost and recompute per-player splits.
 *
 * Participants = everyone who appears in `match_players` for any match
 * linked to this event (via event_matches). RSVPs (going/maybe/no) are
 * deliberately NOT used here: who actually played is the source of truth
 * for cost splitting, not who said "yes". A no-show doesn't get charged;
 * a walk-on does.
 *
 * If no matches have been recorded yet, the cost is saved but no
 * assignments are created — the host can re-save once matches are scored
 * and the participant list resolves itself.
 */
export async function saveEventCost(eventId: string, input: SaveCostInput): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Not signed in' };

  const { data: event } = await supabase
    .from('events').select('host_id').eq('id', eventId).maybeSingle();
  if (!event) return { ok: false, error: 'Event not found' };
  if (event.host_id !== user.id) return { ok: false, error: 'Only the host can edit cost' };

  // Upsert the wallet row. We keep `split_mode` in the schema for future
  // modes (custom amounts, per-game) but for v1 always store the
  // match-players-derived value.
  const { error: upsertErr } = await supabase
    .from('event_costs')
    .upsert({
      event_id: eventId,
      total_amount_paise: Math.max(0, Math.floor(input.total_amount_paise)),
      split_mode: 'equal_present',
      notes: input.notes ?? null,
    }, { onConflict: 'event_id' });
  if (upsertErr) return { ok: false, error: upsertErr.message };

  // Resolve participants from match_players via event_matches.
  const { data: links } = await supabase
    .from('event_matches').select('match_id').eq('event_id', eventId);
  const matchIds = (links ?? []).map(l => l.match_id);

  let participantIds: string[] = [];
  if (matchIds.length > 0) {
    const { data: mps } = await supabase
      .from('match_players').select('player_id').in('match_id', matchIds);
    const seen = new Set<string>();
    for (const mp of (mps ?? [])) {
      if (mp.player_id && !seen.has(mp.player_id)) {
        seen.add(mp.player_id);
        participantIds.push(mp.player_id);
      }
    }
  }

  // Full recompute — wipe prior assignments so the new split is canonical.
  await supabase.from('event_cost_assignments').delete().eq('event_id', eventId);

  if (participantIds.length === 0) {
    revalidatePath(`/events/${eventId}`);
    return { ok: true, data: undefined };
  }

  const total = Math.max(0, Math.floor(input.total_amount_paise));
  const base = Math.floor(total / participantIds.length);
  const remainder = total - base * participantIds.length;
  const rows = participantIds.map((pid, i) => ({
    event_id: eventId,
    player_id: pid,
    // Spread the rounding remainder over the first N so the per-player
    // amounts sum exactly to the total in paise.
    amount_paise: base + (i < remainder ? 1 : 0),
  }));

  const { error: assignErr } = await supabase.from('event_cost_assignments').insert(rows);
  if (assignErr) return { ok: false, error: assignErr.message };

  revalidatePath(`/events/${eventId}`);
  return { ok: true, data: undefined };
}

export async function setAssignmentPaid(assignmentId: string, paid: boolean): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Not signed in' };
  const patch = { paid, paid_at: paid ? new Date().toISOString() : null };
  const { error: updErr } = await supabase
    .from('event_cost_assignments')
    .update(patch)
    .eq('id', assignmentId);
  if (updErr) return { ok: false, error: updErr.message };
  return { ok: true, data: undefined };
}

/**
 * Recompute event cost assignments against the *current* match-players list
 * for this event. Reuses the same total/notes. Useful when a new match is
 * scored (or a player is added to an existing match) and the per-head share
 * needs to change.
 *
 * Preserves `paid` flags for players whose share *didn't change* so we
 * don't make them re-mark. If a player's share changed (e.g. someone new
 * joined and reduced everyone's share), the flag clears for safety.
 *
 * Returns success even when there's no cost row yet (host hasn't set up
 * cost) — call sites can fire-and-forget after match creation.
 */
export async function recomputeEventCost(eventId: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'Not signed in' };

  const { data: event } = await supabase
    .from('events').select('host_id').eq('id', eventId).maybeSingle();
  if (!event) return { ok: false, error: 'Event not found' };
  if (event.host_id !== user.id) {
    // Soft-no-op for non-hosts; RLS would reject the writes anyway.
    return { ok: true, data: undefined };
  }

  const { data: cost } = await supabase
    .from('event_costs')
    .select('total_amount_paise, notes')
    .eq('event_id', eventId)
    .maybeSingle();
  if (!cost) {
    // Host hasn't set up cost yet — nothing to recompute.
    return { ok: true, data: undefined };
  }

  // Snapshot the prior assignments *before* saveEventCost wipes them so we
  // can restore paid flags after the recompute.
  const { data: priorAssignments } = await supabase
    .from('event_cost_assignments')
    .select('player_id, amount_paise, paid, paid_at')
    .eq('event_id', eventId);
  const priorByPlayer = new Map(
    (priorAssignments ?? []).map(a => [a.player_id, a]),
  );

  const result = await saveEventCost(eventId, {
    total_amount_paise: cost.total_amount_paise,
    notes: cost.notes,
  });
  if (!result.ok) return result;

  // Restore paid flags only for players whose share didn't change. A
  // changed share (e.g. cost split now divided across more people) means
  // the prior payment may no longer cover the new amount, so leave it
  // unpaid for the host to confirm.
  const { data: freshAssignments } = await supabase
    .from('event_cost_assignments')
    .select('id, player_id, amount_paise')
    .eq('event_id', eventId);
  const restoreIds: string[] = [];
  for (const fresh of freshAssignments ?? []) {
    const prior = priorByPlayer.get(fresh.player_id);
    if (prior && prior.paid && prior.amount_paise === fresh.amount_paise) {
      restoreIds.push(fresh.id);
    }
  }
  if (restoreIds.length > 0) {
    await supabase
      .from('event_cost_assignments')
      .update({ paid: true, paid_at: new Date().toISOString() })
      .in('id', restoreIds);
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true, data: undefined };
}
