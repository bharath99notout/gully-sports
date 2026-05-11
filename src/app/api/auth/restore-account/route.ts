import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Clears `profiles.deleted_at` for the currently-authed user and resets
 * the (now anonymous) display name back to a neutral default so the user
 * can pick a fresh one on the signup name screen.
 *
 * Called by the login flow immediately after OTP verification when the
 * pre-OTP check signalled `account_deleted: true`.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const { error } = await supabase.rpc('restore_account');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
