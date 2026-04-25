-- Allow admins to permanently delete a match row. CASCADE removes
-- match_scores, player_match_stats, match_players, match_confirmations,
-- match_admin_actions, etc.

create policy "matches_delete_admin" on matches
  for delete using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin = true)
  );
