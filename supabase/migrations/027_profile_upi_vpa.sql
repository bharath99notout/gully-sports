-- ============================================================================
-- 027_profile_upi_vpa.sql
-- Adds the host's UPI VPA (Virtual Payment Address — e.g. 9876543210@ybl,
-- bharath@phonepe) to profiles. Hosts set it once; every event they host
-- uses it for the player-side "Pay via UPI" deeplink and the host's
-- "Share split to WhatsApp" message.
--
-- The column is nullable: the feature is optional. Hosts who don't want
-- digital payment leave it blank and the UI falls back to "Mark paid"
-- (existing honor-system flow).
--
-- Profiles are already publicly readable (RLS `using(true)` from migration
-- 001) — this is intentional since names/avatars feature on leaderboards.
-- A UPI VPA is meant to be shared with payers anyway, but to keep accidental
-- exposure minimal the UI only surfaces it inside event cost sections (i.e.
-- in contexts where the user is paying the host they're already aware of).
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS upi_vpa text;

-- Drop the constraint if a previous run added it, then re-create. Keeps
-- the file safe to re-apply.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_upi_vpa_format;

-- Optional: light shape check so we don't store obvious garbage.
-- VPAs are <handle>@<provider>; the handle is alphanumeric/dot/underscore/
-- dash, the provider is alphanumeric. We allow a generous max length to
-- accommodate provider strings like "okicici", "axisbank", "phonepe".
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_upi_vpa_format CHECK (
    upi_vpa IS NULL OR upi_vpa ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,32}$'
  );
