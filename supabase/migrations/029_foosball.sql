-- ============================================================================
-- 029_foosball.sql
-- Adds 'foosball' to the sport_type enum.
--
-- This file does NOTHING ELSE on purpose. Postgres rejects use of a newly
-- added enum value in the same transaction that added it (SQLSTATE 55P04
-- "unsafe use of new value"). The follow-up insert into sport_settings
-- lives in migration 030 so each statement runs in its own transaction.
--
-- Idempotent: ADD VALUE IF NOT EXISTS is safe to re-run.
-- ============================================================================

ALTER TYPE public.sport_type ADD VALUE IF NOT EXISTS 'foosball';
