-- Backfill auth.users.phone for legacy users who signed up via the
-- <digits>@live.com email-as-phone hack. Without this, signInWithOtp({ phone })
-- can't find them and Supabase returns "Signups not allowed for otp".
--
-- Safe to re-run: only touches rows where phone IS NULL and email matches the
-- legacy pattern. Skips any number already claimed by a different user.

UPDATE auth.users AS u
SET
  phone = '+91' || split_part(u.email, '@', 1),
  phone_confirmed_at = COALESCE(u.phone_confirmed_at, now())
WHERE u.phone IS NULL
  AND u.email LIKE '%@live.com'
  AND split_part(u.email, '@', 1) ~ '^\d{10}$'
  AND NOT EXISTS (
    SELECT 1 FROM auth.users u2
    WHERE u2.phone = '+91' || split_part(u.email, '@', 1)
      AND u2.id <> u.id
  );
