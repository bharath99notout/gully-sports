-- 046_bowling_video_marks.sql
-- Bowling Analyzer V1.1 — video-based capture (replaces V1 manual-tap).
-- Adds optional columns for frame-mark timing + future CV action metrics.
--
-- Why nullable across the board: existing manual-tap rows from V1 don't
-- have these fields. Both capture paths share the same table.
--   * release_ms / pitch_ms — video timestamps the user (or pose detector)
--     marked on the scrub timeline. duration_ms is then pitch_ms-release_ms.
--   * arm_angle_deg + action_class — populated by MediaPipe Pose on the
--     release frame in a follow-up commit. Optional today.
--   * thumbnail_url — small jpg of the release frame for the list view.

ALTER TABLE bowling_deliveries
  ADD COLUMN IF NOT EXISTS release_ms      integer,
  ADD COLUMN IF NOT EXISTS pitch_ms        integer,
  ADD COLUMN IF NOT EXISTS arm_angle_deg   numeric(5,2),
  ADD COLUMN IF NOT EXISTS action_class    text
    CHECK (action_class IN ('side_on','front_on','mixed','unknown')),
  ADD COLUMN IF NOT EXISTS thumbnail_url   text;

-- Replace the recorded_via check to include the new video-based path.
ALTER TABLE bowling_deliveries
  DROP CONSTRAINT IF EXISTS bowling_deliveries_recorded_via_check;
ALTER TABLE bowling_deliveries
  ADD CONSTRAINT bowling_deliveries_recorded_via_check
  CHECK (recorded_via IN ('manual_tap','video_mark','camera_cv','radar','imported'));
