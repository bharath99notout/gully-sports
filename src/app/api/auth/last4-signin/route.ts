import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findAuthUserIdByPhone10 } from '@/lib/supabase/authUserByPhone';
import { expectedLast4Otp } from '@/lib/phoneAuth';

/**
 * Default sign-in path: user's OTP is the last 4 digits of their own phone.
 * Server verifies the match and issues a magiclink `token_hash` that the
 * browser finalises via `supabase.auth.verifyOtp({ token_hash, type })`.
 *
 * This bypasses `signInWithPassword`, which only works for users who both
 * (a) have an `encrypted_password` set, and (b) are email-confirmed — neither
 * holds for users created via Supabase phone OTP. The token-hash path works
 * uniformly for every existing user.
 *
 * Users who have opted into email-OTP login (`email_otp_enabled = true`) are
 * REJECTED here — they must use /api/auth/send-email-otp instead.
 */
export async function POST(req: Request) {
  let body: { phone?: string; otp?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const phone10 = String(body.phone ?? '').replace(/\D/g, '').slice(-10);
  const otp = String(body.otp ?? '');
  if (phone10.length !== 10) {
    return NextResponse.json({ error: 'Invalid phone' }, { status: 400 });
  }
  if (otp !== expectedLast4Otp(phone10)) {
    return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 });
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
  if (profile?.email_otp_enabled) {
    return NextResponse.json(
      { error: 'This account uses email OTP. Use email sign-in instead.' },
      { status: 403 },
    );
  }

  const { data: userRes, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr || !userRes?.user) {
    return NextResponse.json({ error: getErr?.message || 'User not found' }, { status: 500 });
  }

  let email = userRes.user.email?.trim() ?? '';
  if (!email) {
    const placeholder = `${phone10}@phone-otp.invalid`;
    const { error: setEmailErr } = await admin.auth.admin.updateUserById(userId, {
      email: placeholder,
      email_confirm: true,
    });
    if (setEmailErr) {
      return NextResponse.json(
        { error: setEmailErr.message || 'Could not assign placeholder email' },
        { status: 500 },
      );
    }
    email = placeholder;
  }

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    return NextResponse.json(
      { error: linkErr?.message || 'Could not generate sign-in link' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    token_hash: link.properties.hashed_token,
    type: link.properties.verification_type ?? 'magiclink',
  });
}
