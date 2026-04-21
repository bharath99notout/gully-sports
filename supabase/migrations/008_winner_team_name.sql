-- Store winner by name so ad-hoc matches (no team UUIDs) can record a winner
ALTER TABLE matches ADD COLUMN IF NOT EXISTS winner_team_name TEXT;
