import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Sets the caller's email and flips `profiles.email_otp_enabled = true`.
 * The client must have already verified the email via Supabase email OTP
 * (`signInWithOtp({ email })` + `verifyOtp({ email, token, type: 'email' })`).
 *
 * This endpoint just records the opt-in flag once verification has happened.
 * From now on the login page will gate this user behind email OTP and reject
 * the last-4-digit fallback.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const currentEmail = (user.email ?? '').toLowerCase();
  if (currentEmail !== email) {
    return NextResponse.json(
      { error: 'Verified email does not match the email being enabled. Re-verify.' },
      { status: 400 },
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server misconfiguration';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { error: updateErr } = await admin
    .from('profiles')
    .update({ email_otp_enabled: true })
    .eq('id', user.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
