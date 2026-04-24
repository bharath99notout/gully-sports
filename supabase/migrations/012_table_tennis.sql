-- Table Tennis sport support

-- 1. Extend the sport_type enum to include 'table_tennis'.
--    ALTER TYPE ADD VALUE must run outside a transaction. If your migration
--    runner wraps this file in BEGIN/COMMIT, run this line separately in
--    the Supabase SQL editor first.
ALTER TYPE sport_type ADD VALUE IF NOT EXISTS 'table_tennis';

-- 2. Table-tennis-specific match config (separate from badminton_* columns).
ALTER TABLE matches ADD COLUMN IF NOT EXISTS tt_target_points INT DEFAULT 11;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS tt_sets          INT DEFAULT 5;
