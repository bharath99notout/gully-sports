import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findAuthUserIdByPhone10 } from '@/lib/supabase/authUserByPhone';

/**
 * Triggers a Supabase email OTP for a user with `email_otp_enabled = true`.
 * Returns the full email so the browser can finalise verification via
 * `supabase.auth.verifyOtp({ email, token, type: 'email' })`.
 *
 * Privacy note: the email is only revealed to a caller who knows the phone
 * AND triggers an actual OTP send (the email content arrives at the user's
 * own inbox — they still need to read it to advance).
 */
export async function POST(req: Request) {
  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const phone10 = String(body.phone ?? '').replace(/\D/g, '').slice(-10);
  if (phone10.length !== 10) {
    return NextResponse.json({ error: 'Invalid phone' }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server misconfiguration';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const userId = await findAuthUserIdByPhone10(admin, phone10);
  if (!userId) {
    return NextResponse.json({ error: 'No account for this number' }, { status: 404 });
  }

  const { data: profile } = await admin
    .from('profiles').select('email_otp_enabled').eq('id', userId).maybeSingle();
  if (!profile?.email_otp_enabled) {
    return NextResponse.json({ error: 'Email OTP not enabled for this user' }, { status: 400 });
  }

  const { data: userRes } = await admin.auth.admin.getUserById(userId);
  const email = userRes?.user?.email ?? '';
  if (!email || email.toLowerCase().endsWith('@live.com')) {
    return NextResponse.json({ error: 'No email on file' }, { status: 400 });
  }

  const { error: otpErr } = await admin.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (otpErr) {
    return NextResponse.json({ error: otpErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email });
}
