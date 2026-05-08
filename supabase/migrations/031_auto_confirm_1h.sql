-- ============================================================================
-- 031_auto_confirm_1h.sql
--   • Auto-confirm window: 6h → 1h across all sports
--   • Updates seed (018), dispute-reset (015), notification body (018)
--   • Does NOT migrate existing pending matches — only affects new completions
-- ============================================================================

-- ── 1. Seed function (last redefined in 018) ────────────────────────────────

create or replace function seed_match_confirmations()
returns trigger as $$
begin
  if (tg_op = 'INSERT' and new.status = 'completed')
     or (tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'completed')
  then
    if new.scored_by is null then
      new.scored_by := coalesce(new.scored_by, new.created_by);
    end if;

    if approval_enabled_for_sport(new.sport) then
      new.confirmation_state := 'pending';
      new.auto_confirm_at := now() + interval '1 hour';
    else
      new.confirmation_state := 'confirmed';
      new.auto_confirm_at := null;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

-- ── 2. Dispute-reset function (from 015) ────────────────────────────────────

create or replace function reset_dispute_on_recheck()
returns trigger
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_state text;
  v_scorer uuid;
begin
  if tg_table_name = 'match_scores' then
    v_match_id := coalesce(new.match_id, old.match_id);
  else
    v_match_id := coalesce(new.id, old.id);
  end if;

  select confirmation_state, coalesce(scored_by, created_by)
    into v_state, v_scorer
  from matches where id = v_match_id;

  if v_state = 'disputed' then
    update match_confirmations
    set status = 'pending', disputed_reason = null, responded_at = null
    where match_id = v_match_id and player_id <> v_scorer;
    update matches set auto_confirm_at = now() + interval '1 hour'
    where id = v_match_id;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

-- ── 3. Notification body copy (last redefined in 018) ───────────────────────

create or replace function notify_match_participants_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pl record;
  title text := 'Match needs confirmation';
  body text;
  sport_label text;
begin
  if not (
    (tg_op = 'INSERT' and new.status = 'completed')
    or (tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'completed')
  ) then
    return new;
  end if;

  if not approval_enabled_for_sport(new.sport) then
    return new;
  end if;

  sport_label := initcap(replace(new.sport::text, '_', ' '));

  body := format(
    '%s: %s vs %s was recorded. Open the match to confirm or dispute. If you take no action, it auto-confirms in 1 hour.',
    sport_label,
    new.team_a_name,
    new.team_b_name
  );

  for pl in select distinct player_id from match_players where match_id = new.id
  loop
    insert into user_notifications (user_id, match_id, title, body)
    values (pl.player_id, new.id, title, body)
    on conflict (user_id, match_id) do nothing;
  end loop;

  return new;
end;
$$;
