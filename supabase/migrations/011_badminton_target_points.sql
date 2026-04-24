-- Badminton: configurable target points per set (15 or 21, default 21)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS badminton_target_points INT DEFAULT 21;
