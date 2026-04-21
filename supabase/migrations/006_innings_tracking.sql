-- Track current innings number for cricket matches
ALTER TABLE matches ADD COLUMN IF NOT EXISTS current_innings integer DEFAULT 1;
