import type { SupabaseClient } from '@supabase/supabase-js';

/** App expects this many digits for SMS OTP entry (align Twilio/Supabase if using real SMS). */
export const SMS_OTP_LENGTH = 4;

/**
 * Optional dev / cost-saving bypass: same fixed code for any number when
 * `ENABLE_MAGIC_PHONE_OTP=true` (or `1` / `yes`) on the server (see `/api/auth/magic-phone-otp`).
 * Real SMS codes still work. **Do not enable in production** unless you accept the risk.
 */
export const MAGIC_SMS_OTP = '7222';

type MagicResult =
  | { ok: true }
  | { ok: false; kind: 'not_magic' | 'disabled' | 'failed'; message?: string };

/** When `otp` is {@link MAGIC_SMS_OTP}, exchange via server; otherwise `not_magic`. */
export async function tryMagicPhoneOtpSignIn(
  phone10: string,
  otp: string,
  supabase: SupabaseClient,
): Promise<MagicResult> {
  const d = phone10.replace(/\D/g, '').slice(-10);
  if (otp !== MAGIC_SMS_OTP) return { ok: false, kind: 'not_magic' };

  const res = await fetch('/api/auth/magic-phone-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: d, otp }),
  });

  if (res.status === 403) {
    return { ok: false, kind: 'disabled', message: 'Magic OTP is not enabled on the server.' };
  }

  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    token_hash?: string;
    type?: string;
  };

  if (!res.ok) {
    return {
      ok: false,
      kind: 'failed',
      message: body.error || `Magic sign-in failed (${res.status})`,
    };
  }

  const token_hash = body.token_hash;
  if (!token_hash) {
    return { ok: false, kind: 'failed', message: 'Invalid response from server.' };
  }

  const rawType = String(body.type || 'magiclink').toLowerCase();
  const typesToTry = Array.from(
    new Set<'magiclink' | 'email'>([
      (rawType === 'email' || rawType === 'magiclink' ? rawType : 'magiclink') as 'magiclink' | 'email',
      'magiclink',
      'email',
    ]),
  );

  let lastMsg = 'Verification failed';
  for (const t of typesToTry) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type: t });
    if (!error) return { ok: true };
    lastMsg = error.message;
  }
  return { ok: false, kind: 'failed', message: lastMsg };
}

/** Digits only, max length for a single SMS OTP field */
export function normalizeSmsOtpInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, SMS_OTP_LENGTH);
}

/** User-facing copy for common `verifyOtp` / `updateUser` failures */
export function formatOtpVerifyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('security purposes') || m.includes('rate limit') || m.includes('too many')) {
    const seconds = message.match(/(\d+)\s*seconds?/)?.[1];
    return seconds
      ? `Too many attempts. Try again in ${seconds} seconds.`
      : 'Too many attempts. Please wait a minute and try again.';
  }
  if (m.includes('expired') || m.includes('invalid')) {
    return 'That code is wrong or has expired. Request a new OTP and try again.';
  }
  return message;
}

/** 10-digit India local part → E.164 for Supabase phone auth */
export function toIndiaE164(digits10: string): string {
  const d = digits10.replace(/\D/g, '').slice(-10);
  return `+91${d}`;
}

/**
 * Default OTP for users who have NOT enabled email-OTP login: last 4 digits of
 * their own phone number. Validated client-side — no SMS is ever sent.
 */
export function expectedLast4Otp(phone10: string): string {
  return phone10.replace(/\D/g, '').slice(-10).slice(-4);
}

/** Email-as-phone synthetic credential used by the legacy hack. */
export function legacyEmailForPhone10(phone10: string): string {
  return `${phone10.replace(/\D/g, '').slice(-10)}@live.com`;
}

/** Synthetic password for the legacy hack — last 6 digits. */
export function legacyPasswordForPhone10(phone10: string): string {
  return phone10.replace(/\D/g, '').slice(-10).slice(-6);
}
