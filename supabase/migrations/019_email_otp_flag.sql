-- Per-profile flag: when TRUE, the user has opted into email-OTP login.
-- Login flow consults this and uses Supabase email OTP (free, built-in)
-- instead of the default last-4-digits-of-phone client-side OTP.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_otp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
