-- ============================================================================
-- 026_events_fixes.sql
-- Post-launch fixes after Phase 1 dogfooding (May 2026):
--
--   1. event_rsvps had partial UNIQUE indexes (WHERE player_id IS NOT NULL).
--      PostgREST `onConflict` upserts can't target partial indexes — they
--      need a real UNIQUE constraint or a non-partial unique index. Convert
--      both to regular UNIQUE constraints. NULL values in UNIQUE constraints
--      are treated as DISTINCT in Postgres, so guests (player_id NULL) and
--      profile-RSVPs (guest_phone NULL) still coexist correctly.
-- ============================================================================

DROP INDEX IF EXISTS public.event_rsvps_event_player_uk;
DROP INDEX IF EXISTS public.event_rsvps_event_phone_uk;

-- Drop the constraints first if a previous run created them (so this file
-- is safe to re-apply). ALTER TABLE ... DROP CONSTRAINT IF EXISTS is
-- supported in Postgres 9.5+.
ALTER TABLE public.event_rsvps DROP CONSTRAINT IF EXISTS event_rsvps_event_player_uk;
ALTER TABLE public.event_rsvps DROP CONSTRAINT IF EXISTS event_rsvps_event_phone_uk;

ALTER TABLE public.event_rsvps
  ADD CONSTRAINT event_rsvps_event_player_uk UNIQUE (event_id, player_id);

ALTER TABLE public.event_rsvps
  ADD CONSTRAINT event_rsvps_event_phone_uk UNIQUE (event_id, guest_phone);
