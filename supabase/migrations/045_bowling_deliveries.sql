-- 045_bowling_deliveries.sql
-- Bowling Analyzer V1 — manual-assist speed capture (no camera/pose yet).
-- See CLAUDE.md "Bowling Analyzer" for the BRD this implements.
--
-- Guardrails baked into the schema:
--   * speed_is_outlier flag — set true when reading is outside 30–140 km/h.
--     UI hides these from averages + headline numbers, but they're kept so
--     the user can see "we threw this one out" rather than silently losing
--     a tap that mistimed.
--   * distance_m default = 20.12 (standard cricket pitch). Gully players
--     often play shorter — they set distance per delivery on capture.
--   * recorded_via captures whether speed came from manual tap (V1),
--     camera CV (V3), or external hardware (radar). Lets us slice DNA by
--     measurement quality later without changing the schema.

CREATE TABLE IF NOT EXISTS bowling_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bowler_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id        uuid REFERENCES matches(id) ON DELETE SET NULL,
  over_index      numeric(4,1),

  recorded_at     timestamptz NOT NULL DEFAULT now(),
  recorded_via    text NOT NULL DEFAULT 'manual_tap'
                  CHECK (recorded_via IN ('manual_tap','camera_cv','radar','imported')),

  distance_m      numeric(5,2) NOT NULL DEFAULT 20.12,
  duration_ms     integer NOT NULL CHECK (duration_ms > 0),
  speed_kmh       numeric(5,1) NOT NULL,
  speed_is_outlier boolean NOT NULL DEFAULT false,

  privacy_state   text NOT NULL DEFAULT 'private'
                  CHECK (privacy_state IN ('private','match','public')),
  note            text
);

CREATE INDEX IF NOT EXISTS bowling_deliveries_bowler_recent_idx
  ON bowling_deliveries (bowler_id, recorded_at DESC)
  WHERE speed_is_outlier = false;

CREATE INDEX IF NOT EXISTS bowling_deliveries_match_idx
  ON bowling_deliveries (match_id) WHERE match_id IS NOT NULL;

ALTER TABLE bowling_deliveries ENABLE ROW LEVEL SECURITY;

-- Bowler can see and write their own deliveries.
CREATE POLICY "Bowler can read own deliveries"
  ON bowling_deliveries FOR SELECT TO authenticated
  USING (bowler_id = auth.uid());

CREATE POLICY "Bowler can insert own deliveries"
  ON bowling_deliveries FOR INSERT TO authenticated
  WITH CHECK (bowler_id = auth.uid());

CREATE POLICY "Bowler can update own deliveries"
  ON bowling_deliveries FOR UPDATE TO authenticated
  USING (bowler_id = auth.uid())
  WITH CHECK (bowler_id = auth.uid());

CREATE POLICY "Bowler can delete own deliveries"
  ON bowling_deliveries FOR DELETE TO authenticated
  USING (bowler_id = auth.uid());

-- Public deliveries are readable by anyone (for the "Bowling DNA" card on
-- a player profile). Match-scoped is readable by anyone — match pages are
-- already viewable by participants.
CREATE POLICY "Public deliveries are readable by anyone"
  ON bowling_deliveries FOR SELECT TO authenticated
  USING (privacy_state = 'public');

CREATE POLICY "Match-scoped deliveries are readable"
  ON bowling_deliveries FOR SELECT TO authenticated
  USING (privacy_state = 'match' AND match_id IS NOT NULL);
