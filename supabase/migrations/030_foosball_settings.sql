-- ============================================================================
-- 030_foosball_settings.sql
-- Enrols foosball in the per-sport approval-flow toggle (mig 018).
--
-- Run this AFTER migration 029 has been committed — Postgres rejects use
-- of an enum value in the same transaction that added it (55P04). Splitting
-- into two files so each runs in its own statement / transaction in the
-- Supabase SQL editor.
--
-- Idempotent: ON CONFLICT DO NOTHING is safe to re-run.
-- ============================================================================

INSERT INTO public.sport_settings (sport, approval_enabled)
VALUES ('foosball', true)
ON CONFLICT (sport) DO NOTHING;
