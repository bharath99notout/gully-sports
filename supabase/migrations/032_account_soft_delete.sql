-- ============================================================================
-- 032_account_soft_delete.sql
--   Account deletion = soft delete only.
--
--   Why soft, not hard:
--     match_players, match_confirmations, player_match_stats and team_members
--     all reference profiles(id) ON DELETE CASCADE. Deleting a profile would
--     also delete that player's history from every match they ever played in
--     -- the opposite of what the user wants ("delete my account, but keep
--     the matches intact"). The profile row therefore has to live forever
--     to anchor those FKs. We just scrub the PII off it.
--
--   Returning-user flow:
--     We keep deleted_phone_hash so a returning user with the same number is
--     recognised at login and silently re-signed-in to their old account
--     (deleted_at cleared, name reset to 'Player', they pick a new name on
--     the signup name screen). True "start fresh" means using a different
--     mobile number -- documented and accepted constraint of the schema.
-- ============================================================================

-- ── 1. Schema additions ────────────────────────────────────────────────────

alter table profiles
  add column if not exists deleted_at         timestamptz,
  add column if not exists deleted_phone_hash text;

-- Lookup index used by the login + signup-phone-check endpoints to recognise
-- returning deleted users by hashed phone (we no longer store their phone in
-- plaintext after delete).
create index if not exists profiles_deleted_phone_hash_idx
  on profiles (deleted_phone_hash)
  where deleted_phone_hash is not null;

-- ── 2. RPC: soft_delete_account ────────────────────────────────────────────
--   Scrubs PII from the caller's own profile. Caller must be authed
--   (auth.uid() = profile.id is enforced inline).
--   Hashed phone (sha256) is stored so we can recognise the user on return
--   without keeping their number in plaintext. The auth.users row stays so
--   the FK to profiles.id stays valid; the auth user is signed out from the
--   client side after this RPC returns.

-- pgcrypto provides digest(). On Supabase the extension lives in the
-- `extensions` schema (not `public`), so we either qualify the call as
-- `extensions.digest(...)` or include `extensions` on the function's
-- search_path. We do both -- belt and braces -- because some self-hosted
-- envs install pgcrypto in `public` and we want this to just work.
create extension if not exists pgcrypto with schema extensions;

create or replace function soft_delete_account()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid       uuid := auth.uid();
  v_phone     text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select phone into v_phone from profiles where id = v_uid;

  update profiles
  set
    name                = 'Deleted user',
    avatar_url          = null,
    phone               = null,
    upi_vpa             = null,
    email_otp_enabled   = false,
    deleted_at          = now(),
    deleted_phone_hash  = case
                            when v_phone is not null and length(v_phone) > 0
                              then encode(
                                     extensions.digest(convert_to(v_phone, 'UTF8'), 'sha256'),
                                     'hex'
                                   )
                            else null
                          end
  where id = v_uid;
end;
$$;

revoke all on function soft_delete_account() from public;
grant execute on function soft_delete_account() to authenticated;

-- ── 3. RPC: restore_account_for_phone ──────────────────────────────────────
--   Called after a returning user has authed via OTP. Looks up the soft-
--   deleted profile by hashed phone, transfers data ownership to the new
--   auth user, and clears the deleted flag.
--
--   Because the schema has profiles.id = auth.users.id and most player FKs
--   are ON DELETE CASCADE (no ON UPDATE CASCADE), we can't just rewrite
--   profiles.id to the new auth uid without orphaning history. So we do the
--   reverse: delete the freshly-auto-created profile row for the new auth
--   user, then point auth.users at the old profile by updating the OLD
--   profile's id... which we also can't do safely.
--
--   Pragmatic resolution: we DON'T link the old profile to the new auth
--   user. Instead, the API layer arranges things so the user signs back
--   into the SAME old auth.users row (it still exists -- we never deleted
--   it). The RPC's job is just to clear the deleted flag and reset name.
--   The new-auth-user-row case only happens if Supabase admin actually
--   deleted the auth row, which we explicitly avoid.

create or replace function restore_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_phone10 text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Pull the user's verified phone from auth.users so we can re-populate
  -- profiles.phone (we cleared it on soft delete).
  select right(regexp_replace(coalesce(au.phone, split_part(au.email, '@', 1)), '\D', '', 'g'), 10)
    into v_phone10
  from auth.users au
  where au.id = v_uid;

  update profiles
  set
    name               = case when name = 'Deleted user' then 'Player' else name end,
    deleted_at         = null,
    deleted_phone_hash = null,
    phone              = coalesce(nullif(v_phone10, ''), phone)
  where id = v_uid
    and deleted_at is not null;
end;
$$;

revoke all on function restore_account() from public;
grant execute on function restore_account() to authenticated;
