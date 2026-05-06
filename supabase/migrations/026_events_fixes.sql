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

-- Order matters when this file is re-run:
--   1. Drop the constraints first. Postgres auto-drops the backing index
--      created by ADD CONSTRAINT ... UNIQUE — without this step, the
--      DROP INDEX below fails with "cannot drop index because constraint
--      requires it" (SQLSTATE 2BP01).
--   2. Drop the standalone partial indexes left over from migration 024
--      (only relevant on first run — DROP IF EXISTS is a no-op once the
--      constraint owns the index of the same name).
--   3. Re-create the constraints clean.
ALTER TABLE public.event_rsvps DROP CONSTRAINT IF EXISTS event_rsvps_event_player_uk;
ALTER TABLE public.event_rsvps DROP CONSTRAINT IF EXISTS event_rsvps_event_phone_uk;

DROP INDEX IF EXISTS public.event_rsvps_event_player_uk;
DROP INDEX IF EXISTS public.event_rsvps_event_phone_uk;

ALTER TABLE public.event_rsvps
  ADD CONSTRAINT event_rsvps_event_player_uk UNIQUE (event_id, player_id);

ALTER TABLE public.event_rsvps
  ADD CONSTRAINT event_rsvps_event_phone_uk UNIQUE (event_id, guest_phone);
