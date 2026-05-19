-- ============================================================================
-- 037_pickleball.sql
-- Adds 'pickleball' to the sport_type enum.
--
-- This file does NOTHING ELSE on purpose. Postgres rejects use of a newly
-- added enum value in the same transaction that added it (SQLSTATE 55P04
-- "unsafe use of new value"). Follow-up writes (sport_settings, matches
-- columns, tournaments constraint) live in migration 038 so each statement
-- runs in its own transaction.
--
-- Idempotent: ADD VALUE IF NOT EXISTS is safe to re-run.
-- ============================================================================

ALTER TYPE public.sport_type ADD VALUE IF NOT EXISTS 'pickleball';
