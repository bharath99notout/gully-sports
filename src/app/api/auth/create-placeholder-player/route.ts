import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { findAuthUserIdByPhone10 } from '@/lib/supabase/authUserByPhone';
import { toIndiaE164 } from '@/lib/phoneAuth';

/**
 * Creates a placeholder auth user for a player added by phone in a match.
 * Replaces the legacy browser-side `signUp({ email: <digits>@live.com })` hack
 * so new users land in `auth.users` with `phone` set — phone-OTP login then
 * works the first time they try to sign in.
 *
 * Caller must be authenticated (any signed-in user can create a placeholder
 * for a teammate). Requires SUPABASE_SERVICE_ROLE_KEY in the server env.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user: caller } } = await supabase.auth.getUser();
  if (!caller) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  let body: { phone?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const phone10 = String(body.phone ?? '').replace(/\D/g, '').slice(-10);
  const name = String(body.name ?? '').trim();
  if (phone10.length !== 10) {
    return NextResponse.json({ error: 'Phone must be 10 digits' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 });
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
    const { data: profile } = await admin
      .from('profiles').select('name').eq('id', existingId).maybeSingle();
    return NextResponse.json({
      id: existingId,
      name: profile?.name?.trim() || name,
      created: false,
    });
  }

  const e164 = toIndiaE164(phone10);
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    phone: e164,
    phone_confirm: true,
    user_metadata: { name },
  });

  if (createErr || !created?.user) {
    return NextResponse.json(
      { error: createErr?.message || 'Could not create user' },
      { status: 500 },
    );
  }

  const newId = created.user.id;

  await admin.from('profiles')
    .update({ name, phone: phone10 })
    .eq('id', newId);

  return NextResponse.json({ id: newId, name, created: true });
}
