import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Soft-deletes the calling user's profile (scrubs name, avatar, phone, UPI,
 * email-OTP flag) and stores a SHA-256 hash of the phone so a returning
 * user with the same number can be silently restored on next login.
 *
 * We do NOT delete the auth.users row -- doing so would cascade-delete
 * match_players / player_match_stats / match_confirmations / team_members
 * rows that reference profiles.id, wiping the user's match history. The
 * whole point of soft-delete here is to keep the matches intact and just
 * anonymise the player.
 *
 * Caller is signed out by the client after this returns 200.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const { error } = await supabase.rpc('soft_delete_account');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
