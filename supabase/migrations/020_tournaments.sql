-- Tournaments — Phase 1 (league only, single-sport, public, auto-computed awards)
--
-- Design notes:
-- * League format only (round-robin / open fixture). Knockout brackets deferred to Phase 2.
-- * Public by default — anyone can SELECT. Only created_by can mutate.
-- * One player can only be in ONE team per tournament (UNIQUE on tournament_id, player_id
--   in tournament_team_players). Team rosters in this table are tournament-specific
--   snapshots; they don't auto-sync with global team_members.
-- * Awards are auto-computed from player_match_stats filtered by matches.tournament_id.
--   When an organiser hits "End tournament", the current standings are FROZEN by inserting
--   rows into tournament_awards (so future stat changes don't rewrite history).

CREATE TABLE IF NOT EXISTS public.tournaments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  sport       text NOT NULL CHECK (sport IN ('cricket', 'football', 'badminton', 'table_tennis')),
  format      text NOT NULL DEFAULT 'league' CHECK (format IN ('league')),
  status      text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'completed')),
  start_date  date,
  end_date    date,
  description text,
  created_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tournaments_status_idx ON public.tournaments(status);
CREATE INDEX IF NOT EXISTS tournaments_created_by_idx ON public.tournaments(created_by);

CREATE TABLE IF NOT EXISTS public.tournament_teams (
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_id       uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, team_id)
);

CREATE TABLE IF NOT EXISTS public.tournament_team_players (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_id       uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  player_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at      timestamptz NOT NULL DEFAULT now(),
  -- One player can only be on ONE team per tournament (the rule the user requested).
  UNIQUE (tournament_id, player_id)
);

CREATE INDEX IF NOT EXISTS tournament_team_players_team_idx
  ON public.tournament_team_players(tournament_id, team_id);

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS matches_tournament_idx ON public.matches(tournament_id);

CREATE TABLE IF NOT EXISTS public.tournament_awards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  award_type      text NOT NULL,    -- e.g. 'mop' | 'top_run_scorer' | 'top_wicket_taker' | 'most_catches' | 'top_scorer_football' | 'most_wins'
  player_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_value   text NOT NULL,    -- pre-formatted: '412 runs' / '23 wickets' / '9 wins'
  awarded_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, award_type)  -- one award_type per tournament
);

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_team_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_awards ENABLE ROW LEVEL SECURITY;

-- tournaments: public read, owner write
DROP POLICY IF EXISTS tournaments_select ON public.tournaments;
CREATE POLICY tournaments_select ON public.tournaments FOR SELECT USING (true);

DROP POLICY IF EXISTS tournaments_insert ON public.tournaments;
CREATE POLICY tournaments_insert ON public.tournaments FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS tournaments_update ON public.tournaments;
CREATE POLICY tournaments_update ON public.tournaments FOR UPDATE
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS tournaments_delete ON public.tournaments;
CREATE POLICY tournaments_delete ON public.tournaments FOR DELETE
  USING (auth.uid() = created_by);

-- tournament_teams: public read, owner of tournament writes
DROP POLICY IF EXISTS tt_select ON public.tournament_teams;
CREATE POLICY tt_select ON public.tournament_teams FOR SELECT USING (true);

DROP POLICY IF EXISTS tt_insert ON public.tournament_teams;
CREATE POLICY tt_insert ON public.tournament_teams FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.created_by = auth.uid())
);

DROP POLICY IF EXISTS tt_delete ON public.tournament_teams;
CREATE POLICY tt_delete ON public.tournament_teams FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.created_by = auth.uid())
);

-- tournament_team_players: public read, owner of tournament writes
DROP POLICY IF EXISTS ttp_select ON public.tournament_team_players;
CREATE POLICY ttp_select ON public.tournament_team_players FOR SELECT USING (true);

DROP POLICY IF EXISTS ttp_insert ON public.tournament_team_players;
CREATE POLICY ttp_insert ON public.tournament_team_players FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.created_by = auth.uid())
);

DROP POLICY IF EXISTS ttp_delete ON public.tournament_team_players;
CREATE POLICY ttp_delete ON public.tournament_team_players FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.created_by = auth.uid())
);

-- tournament_awards: public read, owner of tournament writes
DROP POLICY IF EXISTS ta_select ON public.tournament_awards;
CREATE POLICY ta_select ON public.tournament_awards FOR SELECT USING (true);

DROP POLICY IF EXISTS ta_insert ON public.tournament_awards;
CREATE POLICY ta_insert ON public.tournament_awards FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.created_by = auth.uid())
);

DROP POLICY IF EXISTS ta_delete ON public.tournament_awards;
CREATE POLICY ta_delete ON public.tournament_awards FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.created_by = auth.uid())
);
