-- ============================================================================
-- ONE-OFF: Merge legacy auth profile into phone-OTP profile (same mobile)
--
-- You MUST replace the two placeholder UUIDs below (lines with v_old / v_new)
-- with real values from Table editor → public.profiles → column "id".
--
-- For Bharath / 6366007222:
--   v_old = row with is_admin TRUE, older created_at (Apr 21) — legacy account
--   v_new = row with is_admin FALSE, newer created_at (Apr 25) — SMS login
--
-- Then run ONLY the DO $$ ... END $$; block (or the whole file after editing).
-- ============================================================================

-- STEP 1 — Run this alone first; copy the two different "id" values.
-- select id, name, phone, is_admin, created_at
-- from public.profiles
-- where phone = '6366007222'
-- order by created_at;

-- STEP 2 — Replace BOTH strings below (keep ::uuid). Do not leave placeholders.

DO $$
DECLARE
  v_old uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid; -- PASTE old (admin) profiles.id here
  v_new uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid; -- PASTE new (SMS) profiles.id here
BEGIN
  IF v_old = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid
     OR v_new = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid THEN
    RAISE EXCEPTION
      'Replace the two placeholder UUIDs in DECLARE: v_old = admin/legacy profiles.id, v_new = phone-OTP profiles.id (see STEP 1 query).';
  END IF;

  IF v_old = v_new THEN
    RAISE EXCEPTION 'v_old and v_new must be different.';
  END IF;

  UPDATE public.profiles AS n
  SET
    name       = coalesce(nullif(trim(n.name), ''), trim(o.name)),
    phone      = coalesce(nullif(trim(n.phone), ''), trim(o.phone)),
    avatar_url = coalesce(n.avatar_url, o.avatar_url),
    is_admin   = coalesce(o.is_admin, false) OR coalesce(n.is_admin, false)
  FROM public.profiles o
  WHERE n.id = v_new AND o.id = v_old;

  UPDATE public.player_match_stats SET player_id = v_new WHERE player_id = v_old;
  UPDATE public.team_members       SET player_id = v_new WHERE player_id = v_old;
  UPDATE public.match_players      SET player_id = v_new WHERE player_id = v_old;
  UPDATE public.match_confirmations SET player_id = v_new WHERE player_id = v_old;

  UPDATE public.user_notifications SET user_id = v_new WHERE user_id = v_old;

  UPDATE public.teams   SET created_by = v_new WHERE created_by = v_old;
  UPDATE public.matches SET created_by = v_new WHERE created_by = v_old;
  UPDATE public.matches SET scored_by  = v_new WHERE scored_by  = v_old;
  UPDATE public.matches SET striker_id = v_new WHERE striker_id = v_old;
  UPDATE public.matches SET non_striker_id = v_new WHERE non_striker_id = v_old;
  UPDATE public.matches SET bowler_id  = v_new WHERE bowler_id  = v_old;

  UPDATE public.match_admin_actions SET admin_id = v_new WHERE admin_id = v_old;

  DELETE FROM auth.users WHERE id = v_old;
END $$;

-- Sign out in the app, sign in again with phone OTP.
