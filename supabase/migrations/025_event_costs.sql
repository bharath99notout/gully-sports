-- ============================================================================
-- 025_event_costs.sql
-- Phase 1 chunk 3: Cost split (host-only writes; honor-system mark-paid).
--
-- One event_costs row per event (the wallet); 0+ event_cost_items (line
-- items, e.g. court 900, balls 200); one event_cost_assignment per
-- (event, player) computed by the host on save.
--
-- Money is stored as integer paise (1 INR = 100 paise) to avoid float bugs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_costs (
  event_id            uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  total_amount_paise  int NOT NULL DEFAULT 0 CHECK (total_amount_paise >= 0),
  -- Default `equal_present` per product decision: split among players the
  -- host marks as attended after the event, avoiding the "I didn't show up"
  -- dispute pattern.
  split_mode          text NOT NULL DEFAULT 'equal_present'
                        CHECK (split_mode IN ('equal_going','equal_present','custom')),
  notes               text,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_cost_items (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id            uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  label               text NOT NULL,
  amount_paise        int NOT NULL CHECK (amount_paise >= 0),
  -- Optional: who picked up this line item upfront. NULL = host.
  paid_by_player_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_cost_items_event_idx ON public.event_cost_items(event_id);

CREATE TABLE IF NOT EXISTS public.event_cost_assignments (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  player_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Net amount in paise (signed): positive = owes, negative = paid more
  -- than their fair share so they're owed a refund.
  amount_paise    int NOT NULL,
  paid            boolean NOT NULL DEFAULT false,
  paid_at         timestamptz,
  UNIQUE (event_id, player_id)
);

CREATE INDEX IF NOT EXISTS eca_player_idx ON public.event_cost_assignments(player_id);

-- ── auto-bump updated_at on event_costs ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_event_costs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_costs_touch_updated_at ON public.event_costs;
CREATE TRIGGER event_costs_touch_updated_at
  BEFORE UPDATE ON public.event_costs
  FOR EACH ROW EXECUTE PROCEDURE public.touch_event_costs_updated_at();

-- ── RLS: anyone in the event can READ costs (so players see what they
--    owe); only the host can WRITE. Players can mark their own assignment
--    as paid/unpaid via UPDATE on event_cost_assignments. ────────────────

ALTER TABLE public.event_costs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_cost_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_cost_assignments   ENABLE ROW LEVEL SECURITY;

CREATE POLICY ec_select ON public.event_costs FOR SELECT USING (true);
CREATE POLICY ec_insert ON public.event_costs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.host_id = auth.uid())
  );
CREATE POLICY ec_update ON public.event_costs
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.host_id = auth.uid())
  );

CREATE POLICY eci_select ON public.event_cost_items FOR SELECT USING (true);
CREATE POLICY eci_insert ON public.event_cost_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.host_id = auth.uid())
  );
CREATE POLICY eci_delete ON public.event_cost_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.host_id = auth.uid())
  );

CREATE POLICY eca_select ON public.event_cost_assignments FOR SELECT USING (true);
CREATE POLICY eca_insert ON public.event_cost_assignments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.host_id = auth.uid())
  );
-- Host can update everything; players can flip `paid` on their own row.
CREATE POLICY eca_update ON public.event_cost_assignments
  FOR UPDATE USING (
    auth.uid() = player_id
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.host_id = auth.uid())
  );
CREATE POLICY eca_delete ON public.event_cost_assignments
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.host_id = auth.uid())
  );
