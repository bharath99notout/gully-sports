/**
 * After a status-changing action on the match page (declare winner, switch
 * innings, end set, etc.) we reload so the server-rendered scoreboard /
 * post-match summary reflects the new state.
 *
 * If the user got here via `?edit=1` (admin-edit mode for a completed match),
 * we drop that flag — keeping it across the reload would leave
 * `adminOverrideCompleted=true`, which hides the post-match summary even
 * though the match has just been re-declared.
 */
export function reloadMatchClean(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('edit');
  // Hash-strip too — match.id?edit=1#match-scorecard would otherwise jump
  // to a section that's been replaced by the post-match summary.
  url.hash = '';
  window.location.assign(url.toString());
}
