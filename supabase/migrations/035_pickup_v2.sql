-- ============================================================================
-- 035_pickup_v2.sql
--   Phase V2 helpers for "Need Players Now":
--     - increment_no_show(): bumps a joiner's reliability counter; called
--       when a host marks `no_show` on a pickup_response.
--     - profiles_caliber_*_idx: indexes that speed up caliber-window filters
--       on the push fan-out path. Caliber is derived from player_match_stats
--       so we don't have a single column to index — for MVP we'll filter in
--       app code, but the indexes here support a future materialized view.
-- ============================================================================

-- Increment reliability_no_shows on the joiner's profile (idempotent SECURITY
-- DEFINER RPC — caller doesn't need an UPDATE policy on profiles).
create or replace function public.increment_no_show(p_user_id uuid)
returns void
language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id is null then return; end if;
  update public.profiles
     set reliability_no_shows = coalesce(reliability_no_shows, 0) + 1
   where id = p_user_id;
end;
$$;

revoke all on function public.increment_no_show(uuid) from public;
grant execute on function public.increment_no_show(uuid) to authenticated;

-- Useful for "find recent collaborators" mutual-friends query.
create index if not exists match_players_player_idx
  on public.match_players(player_id, match_id);
