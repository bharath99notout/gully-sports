import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Step 1 of "enable email OTP login" — invoked by signup (after user typed
 * an optional email) and by the profile page (when an existing user opts in).
 *
 * Updates the caller's `auth.users.email` to the new address (admin API,
 * email_confirm = false so the user has to verify) and triggers a Supabase
 * email OTP to that address.
 *
 * Returns the email back to the browser so it can finalise via
 * `supabase.auth.verifyOtp({ email, token, type: 'email' })`.
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

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server misconfiguration';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
    email,
    email_confirm: false,
  });
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
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
