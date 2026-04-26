import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findAuthUserIdByPhone10 } from '@/lib/supabase/authUserByPhone';
import { MAGIC_SMS_OTP } from '@/lib/phoneAuth';

/** Stable synthetic email for phone-only users so Admin `generateLink({ type: 'magiclink' })` works. */
function placeholderEmailForPhone10(digits10: string): string {
  const d = digits10.replace(/\D/g, '').slice(-10);
  return `${d}@phone-otp.invalid`;
}

function isMagicPhoneOtpEnabled(): boolean {
  const v = (process.env.ENABLE_MAGIC_PHONE_OTP ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/**
 * Issues a one-time magiclink token_hash so the browser can `verifyOtp` without SMS.
 * Gated by ENABLE_MAGIC_PHONE_OTP (true / 1 / yes) and SUPABASE_SERVICE_ROLE_KEY.
 *
 * Phone-only accounts get a server-assigned placeholder email (confirmed) when needed;
 * real SMS flow is unchanged.
 */
export async function POST(req: Request) {
  if (!isMagicPhoneOtpEnabled()) {
    return NextResponse.json(
      {
        error:
          'Magic phone OTP is off. Set ENABLE_MAGIC_PHONE_OTP=true (or 1) and SUPABASE_SERVICE_ROLE_KEY in the server env (e.g. Vercel → Environment Variables), then redeploy.',
      },
      { status: 403 },
    );
  }

  let body: { phone?: string; otp?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const phone10 = String(body.phone ?? '').replace(/\D/g, '').slice(-10);
  const otp = String(body.otp ?? '');
  if (phone10.length !== 10 || otp !== MAGIC_SMS_OTP) {
    return NextResponse.json({ error: 'Invalid phone or OTP' }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server misconfiguration';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let userId: string | null;
  try {
    userId = await findAuthUserIdByPhone10(admin, phone10);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Lookup failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (!userId) {
    return NextResponse.json(
      {
        error:
          'No account for this number yet. Complete a normal SMS sign-up once, then magic OTP works.',
      },
      { status: 404 },
    );
  }

  const { data: userRes, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr || !userRes?.user) {
    return NextResponse.json({ error: getErr?.message || 'User not found' }, { status: 500 });
  }

  let email = userRes.user.email?.trim() ?? '';
  if (!email) {
    const synthetic = placeholderEmailForPhone10(phone10);
    const { error: setEmailErr } = await admin.auth.admin.updateUserById(userId, {
      email: synthetic,
      email_confirm: true,
    });
    if (setEmailErr) {
      return NextResponse.json(
        { error: setEmailErr.message || 'Could not attach placeholder email for magic sign-in' },
        { status: 500 },
      );
    }
    email = synthetic;
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
