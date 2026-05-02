import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findAuthUserIdByPhone10 } from '@/lib/supabase/authUserByPhone';

/**
 * Given a 10-digit phone, return whether that user has email-OTP login enabled.
 * If yes, also return a masked email hint so the client can render
 * "We'll send a code to b***@gmail.com".
 *
 * Used by the login page to decide whether to show the last-4-digits OTP UI
 * (default) or the email-OTP UI (opt-in users).
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
  } catch {
    return NextResponse.json({ exists: false, email_otp_enabled: false });
  }

  const userId = await findAuthUserIdByPhone10(admin, phone10);
  if (!userId) {
    return NextResponse.json({ exists: false, email_otp_enabled: false });
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('email_otp_enabled')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.email_otp_enabled) {
    return NextResponse.json({ exists: true, email_otp_enabled: false });
  }

  const { data: userRes } = await admin.auth.admin.getUserById(userId);
  const email = userRes?.user?.email ?? '';
  const isLegacy = email.toLowerCase().endsWith('@live.com');
  if (!email || isLegacy) {
    return NextResponse.json({ exists: true, email_otp_enabled: false });
  }

  return NextResponse.json({
    exists: true,
    email_otp_enabled: true,
    email_hint: maskEmail(email),
  });
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const head = local.slice(0, 1);
  const tail = local.length > 2 ? local.slice(-1) : '';
  const stars = '*'.repeat(Math.max(1, local.length - head.length - tail.length));
  return `${head}${stars}${tail}@${domain}`;
}
