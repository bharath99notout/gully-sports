import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import EditProfileForm from './EditProfileForm';
import EmailOtpSection from './EmailOtpSection';
import SignOutButton from './SignOutButton';
import ProfileAvatar from './ProfileAvatar';

/**
 * Account/settings page. Deliberately *not* a stats showcase — the dashboard
 * (/) and the public profile (/p/[id]) already do that. Keep this page about
 * controls: edit your name / UPI / email, manage sign-in, sign out.
 */

function isSyntheticPhoneEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return e.endsWith('@live.com')
      || e.endsWith('.invalid')
      || /^\d{10}@/.test(e);
}

/** Pull the 10-digit phone out of `<phone10>@live.com` / `<phone10>@phone-otp.invalid`
 *  style synthetic emails. Returns null if the email doesn't fit the pattern. */
function phoneFromSyntheticEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const m = email.match(/^(\d{10})@/);
  return m ? m[1] : null;
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?next=/profile');

  // Try the modern select first; if migration 027 hasn't landed yet the
  // `upi_vpa` column will be missing and the whole query fails with 42703.
  // We catch that and retry without the column so the rest of the page
  // still works — the UPI input will just say "Not set" until the
  // migration is applied.
  let { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, name, avatar_url, phone, upi_vpa, created_at, email_otp_enabled')
    .eq('id', user.id)
    .single();
  if (profileErr) {
    if ((profileErr as { code?: string }).code === '42703') {
      const fallback = await supabase
        .from('profiles')
        .select('id, name, avatar_url, phone, created_at, email_otp_enabled')
        .eq('id', user.id)
        .single();
      profile = (fallback.data ? { ...fallback.data, upi_vpa: null } : null) as typeof profile;
      console.warn('[profile] upi_vpa column missing — apply migration 027 to enable the UPI field');
    } else {
      console.warn('[profile] select failed', profileErr);
    }
  }

  // Mobile fallback chain — these users predate later migrations so any
  // single source can be null:
  //   1. profiles.phone  (preferred — set by signup-time backfill, mig 016)
  //   2. auth.users.phone with country code stripped to last 10 digits
  //   3. legacy synthetic email (`6366007222@phone-otp.invalid` / `@live.com`)
  //      — the phone is encoded as the local-part of the email.
  // We check all three so the UI never lies about a phone the system
  // already knows.
  const authPhone10 = (user.phone ?? '').replace(/\D/g, '').slice(-10);
  const emailPhone10 = phoneFromSyntheticEmail(user.email);
  const fallbackPhone =
       (authPhone10.length === 10 ? authPhone10 : null)
    || emailPhone10;

  const profileWithFallbacks = profile
    ? { ...profile, phone: profile.phone || fallbackPhone }
    : null;

  const displayName = profile?.name?.trim() || 'Player';
  const realEmail = isSyntheticPhoneEmail(user.email) ? '' : (user.email ?? '');

  return (
    <div className="max-w-md mx-auto flex flex-col gap-5">
      {/* Compact header — small avatar + name + link to public profile */}
      <header className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <ProfileAvatar
          userId={user.id}
          name={displayName}
          avatarUrl={profile?.avatar_url}
        />
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-white truncate">{displayName}</p>
          <Link
            href={`/p/${user.id}`}
            className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 mt-1"
          >
            View public profile <ExternalLink size={11} />
          </Link>
        </div>
      </header>

      {/* Account fields */}
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Account</h2>
        <EditProfileForm profile={profileWithFallbacks} />
        <EmailOtpSection
          currentEmail={realEmail}
          enabled={Boolean((profile as { email_otp_enabled?: boolean } | null)?.email_otp_enabled)}
        />
      </section>

      {/* Danger / device controls */}
      <div className="flex justify-center pt-2 pb-4">
        <SignOutButton />
      </div>
    </div>
  );
}
