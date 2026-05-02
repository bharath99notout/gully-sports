import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findAuthUserIdByPhone10 } from '@/lib/supabase/authUserByPhone';
import {
  expectedLast4Otp,
  legacyEmailForPhone10,
  legacyPasswordForPhone10,
  toIndiaE164,
} from '@/lib/phoneAuth';

/**
 * Default signup path: user's OTP is the last 4 digits of their own phone.
 * Server verifies the match, creates the auth user via Admin API (with both
 * email and phone confirmed so the new user can sign in immediately), and
 * returns a magiclink `token_hash` for the browser to finalise via
 * `supabase.auth.verifyOtp({ token_hash, type })`.
 *
 * Using Admin createUser sidesteps Supabase's "Confirm email" project setting
 * — the user is born in a usable state regardless of how the project is
 * configured.
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

  const existingId = await findAuthUserIdByPhone10(admin, phone10);
  if (existingId) {
    return NextResponse.json(
      { error: 'An account with this number already exists. Sign in instead.' },
      { status: 409 },
    );
  }

  const email = legacyEmailForPhone10(phone10);
  const password = legacyPasswordForPhone10(phone10);
  const e164 = toIndiaE164(phone10);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    phone: e164,
    email_confirm: true,
    phone_confirm: true,
    user_metadata: { name: '' },
  });
  if (createErr || !created?.user) {
    return NextResponse.json(
      { error: createErr?.message || 'Could not create account' },
      { status: 500 },
    );
  }

  await admin.from('profiles')
    .update({ phone: phone10 })
    .eq('id', created.user.id);

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    return NextResponse.json(
      { error: linkErr?.message || 'Account created but sign-in link failed' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    token_hash: link.properties.hashed_token,
    type: link.properties.verification_type ?? 'magiclink',
  });
}
