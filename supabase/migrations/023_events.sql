-- ============================================================================
-- 023_events.sql
-- Phase 1 (chunk 1): Events primitive + match link.
--
-- An "event" is a scheduled multi-sport gathering. Future chunks add:
--   - RSVPs + guest invites (chunk 2 — separate migration)
--   - Cost splitting (chunk 3 — separate migration)
--
-- This migration is intentionally narrow: just the parent table and the
-- match-link table. Cost/RSVP work lands when those features ship so we
-- don't carry empty tables in production.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.events (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                text NOT NULL,
  sport               sport_type NOT NULL,
  host_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  start_at            timestamptz NOT NULL,
  end_at              timestamptz,
  venue_name          text,
  venue_map_url       text,
  capacity            int CHECK (capacity IS NULL OR capacity >= 1),
  description         text,
  -- Default false = public-link (anyone with the URL can RSVP). When true,
  -- only phones in event_invites (chunk 2) may RSVP. Page is still publicly
  -- viewable in both modes.
  invite_only         boolean NOT NULL DEFAULT false,
  status              text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','closed','completed','cancelled')),
  cancellation_reason text,
  rsvp_cutoff_at      timestamptz,
  cover_image_url     text,
  -- Optional link to a tournament. NULL for casual one-off events.
  tournament_id       uuid REFERENCES public.tournaments(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_host_idx       ON public.events(host_id);
CREATE INDEX IF NOT EXISTS events_start_idx      ON public.events(start_at);
CREATE INDEX IF NOT EXISTS events_status_idx     ON public.events(status);
CREATE INDEX IF NOT EXISTS events_tournament_idx ON public.events(tournament_id) WHERE tournament_id IS NOT NULL;

-- ── auto-bump updated_at ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_events_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_touch_updated_at ON public.events;
CREATE TRIGGER events_touch_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE PROCEDURE public.touch_events_updated_at();

-- ── event ↔ match link (chunk 4 surfaces leaderboards from this) ───────────

CREATE TABLE IF NOT EXISTS public.event_matches (
  event_id    uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  match_id    uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, match_id)
);

CREATE INDEX IF NOT EXISTS event_matches_match_idx ON public.event_matches(match_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_matches ENABLE ROW LEVEL SECURITY;

-- DROP-then-CREATE so the migration is safe to re-run after a partial
-- failure (e.g. the table already exists from a previous attempt).
DROP POLICY IF EXISTS events_select ON public.events;
DROP POLICY IF EXISTS events_insert ON public.events;
DROP POLICY IF EXISTS events_update ON public.events;
DROP POLICY IF EXISTS events_delete ON public.events;
DROP POLICY IF EXISTS em_select ON public.event_matches;
DROP POLICY IF EXISTS em_insert ON public.event_matches;
DROP POLICY IF EXISTS em_delete ON public.event_matches;

-- Events are publicly viewable (the public-link share is the whole point).
CREATE POLICY events_select ON public.events
  FOR SELECT USING (true);

-- Anyone signed in can create an event; they become the host.
CREATE POLICY events_insert ON public.events
  FOR INSERT WITH CHECK (auth.uid() = host_id);

-- Only the host can update their event.
CREATE POLICY events_update ON public.events
  FOR UPDATE USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);

-- Only the host can delete (rare path; cancellation is a status update).
CREATE POLICY events_delete ON public.events
  FOR DELETE USING (auth.uid() = host_id);

-- event_matches mirrors event ownership: anyone reads, only host writes.
CREATE POLICY em_select ON public.event_matches
  FOR SELECT USING (true);

CREATE POLICY em_insert ON public.event_matches
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.host_id = auth.uid())
  );

CREATE POLICY em_delete ON public.event_matches
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.host_id = auth.uid())
  );
