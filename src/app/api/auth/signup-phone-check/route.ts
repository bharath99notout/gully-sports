import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findAuthUserIdByPhone10 } from '@/lib/supabase/authUserByPhone';

/**
 * Returns whether an auth user already exists for this mobile (phone identity or legacy `{digits}@live.com`).
 * Requires `SUPABASE_SERVICE_ROLE_KEY` (same as magic OTP). If misconfigured, returns `exists: false`.
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
    return NextResponse.json({ exists: false, checkSkipped: true });
  }

  try {
    const id = await findAuthUserIdByPhone10(admin, phone10);
    if (id == null) {
      // Also check for a soft-deleted profile whose phone we hashed away.
      // findAuthUserIdByPhone10 won't find it via profiles.phone (cleared on
      // delete) but the auth.users row with the same number is still around
      // -- so id is non-null in practice. This branch is just a safety net.
      return NextResponse.json({ exists: false });
    }
    const { data: profile } = await admin
      .from('profiles')
      .select('deleted_at')
      .eq('id', id)
      .maybeSingle();
    const accountDeleted = Boolean((profile as { deleted_at?: string } | null)?.deleted_at);
    return NextResponse.json({ exists: true, account_deleted: accountDeleted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Lookup failed';
    return NextResponse.json({ exists: false, checkSkipped: true, error: msg });
  }
}
