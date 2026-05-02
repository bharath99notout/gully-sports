-- Repoint tournament_team_players.player_id and tournament_awards.player_id to
-- profiles(id) instead of auth.users(id). This matches the convention used by
-- team_members and player_match_stats and — critically — lets PostgREST
-- auto-resolve `profiles(...)` joins in select queries. Without an FK to
-- profiles, the joined select silently returns null and the UI shows "No
-- players yet" even when rows exist in the table.
--
-- profiles.id itself FK's to auth.users(id), so referential integrity is
-- preserved through the chain.

-- tournament_team_players ------------------------------------------------------
ALTER TABLE public.tournament_team_players
  DROP CONSTRAINT IF EXISTS tournament_team_players_player_id_fkey;

ALTER TABLE public.tournament_team_players
  ADD CONSTRAINT tournament_team_players_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- tournament_awards ------------------------------------------------------------
ALTER TABLE public.tournament_awards
  DROP CONSTRAINT IF EXISTS tournament_awards_player_id_fkey;

ALTER TABLE public.tournament_awards
  ADD CONSTRAINT tournament_awards_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
