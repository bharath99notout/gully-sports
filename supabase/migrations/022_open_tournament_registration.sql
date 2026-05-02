-- Open registration: any team owner can attach their own team to any
-- tournament; tournament organizer can attach any team to their tournament.
--
-- Trust-based amateur model — no approval workflow. Spam mitigation deferred
-- (organizer can still kick teams via DELETE, which they retain).
--
-- Affected policies:
--   tournament_teams.INSERT/DELETE
--   tournament_team_players.INSERT/DELETE
--
-- Old policy: only tournament.created_by = auth.uid()
-- New policy: tournament.created_by = auth.uid()  OR  team.created_by = auth.uid()

-- ── tournament_teams ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tt_insert ON public.tournament_teams;
CREATE POLICY tt_insert ON public.tournament_teams FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.created_by = auth.uid())
  OR
  EXISTS (SELECT 1 FROM public.teams       tm WHERE tm.id = team_id      AND tm.created_by = auth.uid())
);

DROP POLICY IF EXISTS tt_delete ON public.tournament_teams;
CREATE POLICY tt_delete ON public.tournament_teams FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.created_by = auth.uid())
  OR
  EXISTS (SELECT 1 FROM public.teams       tm WHERE tm.id = team_id      AND tm.created_by = auth.uid())
);

-- ── tournament_team_players ─────────────────────────────────────────────────

DROP POLICY IF EXISTS ttp_insert ON public.tournament_team_players;
CREATE POLICY ttp_insert ON public.tournament_team_players FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.created_by = auth.uid())
  OR
  EXISTS (SELECT 1 FROM public.teams       tm WHERE tm.id = team_id      AND tm.created_by = auth.uid())
);

DROP POLICY IF EXISTS ttp_delete ON public.tournament_team_players;
CREATE POLICY ttp_delete ON public.tournament_team_players FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.created_by = auth.uid())
  OR
  EXISTS (SELECT 1 FROM public.teams       tm WHERE tm.id = team_id      AND tm.created_by = auth.uid())
);
