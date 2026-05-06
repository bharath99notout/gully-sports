import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * Guest RSVP — no auth required. Lets a friend who got the WhatsApp link
 * say "going" without first signing up. They claim their stats later via
 * the standard last-4-OTP signup flow which links these rows by phone.
 *
 * Server-only validations:
 *   - phone is 10 digits
 *   - event exists, not cancelled, RSVP window open
 *   - if invite_only, phone is on the allowlist
 *   - capacity → demote to waitlist instead of rejecting (consistent with
 *     the signed-in path)
 *
 * Uses the service-role client so the unauthenticated insert can bypass
 * RLS — but ONLY after these checks. Guest phones never leak back to the
 * client; this route returns just `{ status }`.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await params;
  let body: { name?: string; phone?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const status = body.status as 'going' | 'maybe' | 'not_going' | undefined;
  if (!status || !['going', 'maybe', 'not_going'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  const phone10 = (body.phone ?? '').replace(/\D/g, '').slice(-10);
  if (phone10.length !== 10) return NextResponse.json({ error: 'Phone must be 10 digits' }, { status: 400 });

  // Anon client for read-only validation (RLS allows public select on events).
  const ro = await createClient();
  const { data: event } = await ro
    .from('events')
    .select('id, capacity, invite_only, status, rsvp_cutoff_at')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  if (event.status === 'cancelled') return NextResponse.json({ error: 'Event was cancelled' }, { status: 400 });
  if (event.rsvp_cutoff_at && new Date(event.rsvp_cutoff_at) < new Date()) {
    return NextResponse.json({ error: 'RSVPs are closed' }, { status: 400 });
  }

  // Service-role client for the writes that need to bypass RLS.
  const admin = createAdminClient();

  // Invite-only enforcement. event_invites is host-only readable via RLS,
  // but the admin client bypasses that — fine here since we only verify
  // membership and don't return phone numbers.
  if (event.invite_only) {
    const { data: invite } = await admin
      .from('event_invites')
      .select('phone')
      .eq('event_id', eventId)
      .eq('phone', phone10)
      .maybeSingle();
    if (!invite) return NextResponse.json({ error: 'This event is invite-only' }, { status: 403 });
  }

  // If a profile already exists for this phone, prefer the player_id RSVP
  // path so stats link properly when they later sign in.
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id, phone')
    .ilike('phone', `%${phone10}`)
    .maybeSingle();

  let finalStatus: 'going' | 'maybe' | 'not_going' | 'waitlist' = status;
  if (status === 'going' && event.capacity != null) {
    const { count } = await admin
      .from('event_rsvps')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'going');
    if ((count ?? 0) >= event.capacity) finalStatus = 'waitlist';
  }

  if (existingProfile?.id) {
    const { error } = await admin.from('event_rsvps').upsert({
      event_id: eventId,
      player_id: existingProfile.id,
      status: finalStatus,
      responded_at: new Date().toISOString(),
    }, { onConflict: 'event_id,player_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin.from('event_rsvps').upsert({
      event_id: eventId,
      guest_name: name,
      guest_phone: phone10,
      status: finalStatus,
      responded_at: new Date().toISOString(),
    }, { onConflict: 'event_id,guest_phone' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: finalStatus });
}
