-- Extended per-player cricket stats for pro-style scorecard
ALTER TABLE player_match_stats
  ADD COLUMN IF NOT EXISTS balls_faced    INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fours          INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sixes          INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balls_bowled   INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS runs_conceded  INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_out         BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS dismissal      TEXT;
