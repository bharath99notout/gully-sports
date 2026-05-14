-- ============================================================================
-- 039_player_list_latency_indexes.sql
--   Targeted indexes for Players list and Trust Score reads.
-- ============================================================================

-- Supports newest-first Players list ordering and lazy-loaded page slices.
create index if not exists profiles_created_id_desc_idx
  on public.profiles(created_at desc, id desc);

-- Supports pickup attendance/no-show aggregation by player and status.
create index if not exists pickup_responses_joiner_status_idx
  on public.pickup_responses(joiner_id, status);

-- Supports completed/confirmed match filters without duplicating the matches
-- primary-key index. The id column remains included for join lookups.
create index if not exists matches_status_confirmation_id_idx
  on public.matches(status, confirmation_state, id);
