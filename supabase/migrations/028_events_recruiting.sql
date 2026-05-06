-- ============================================================================
-- 028_events_recruiting.sql
-- Adds an explicit "recruiting" flag so hosts can opt their event into the
-- "Looking for Players" feed.
--
-- Why a separate flag instead of deriving from capacity vs going_count?
--   - Many events have capacity set as a hard cap, not as a recruitment ask.
--     Treating "spots open" as "recruiting" would surface every fixture that
--     hasn't filled, drowning the feed in noise.
--   - Recruiting is a deliberate intent ("I need 1 more for badminton tonight"),
--     so we let hosts opt in.
-- ============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS recruiting boolean NOT NULL DEFAULT false;

-- Partial index — feed queries filter on recruiting=true, the common case.
CREATE INDEX IF NOT EXISTS events_recruiting_idx
  ON public.events(start_at)
  WHERE recruiting = true AND status = 'open';
