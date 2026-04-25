-- ============================================================================
-- 015_auto_confirm_6h_notifications.sql
--  • Auto-confirm window: 24h → 6h (seed + dispute-reset functions)
--  • In-app notifications for every match_players row when a match completes
-- ============================================================================

-- ── 1. Shorter auto-confirm on new completions & dispute rechecks ───────────

create or replace function seed_match_confirmations()
returns trigger as $$
begin
  if (tg_op = 'INSERT' and new.status = 'completed')
     or (tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'completed')
  then
    if new.scored_by is null then
      new.scored_by := coalesce(new.scored_by, new.created_by);
    end if;
    new.confirmation_state := 'pending';
    new.auto_confirm_at := now() + interval '6 hours';
  end if;
  return new;
end;
$$ language plpgsql;

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
    update matches set auto_confirm_at = now() + interval '6 hours'
    where id = v_match_id;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

-- Shorten any still-pending window that was scheduled farther out than 6h from now
update matches
set auto_confirm_at = least(coalesce(auto_confirm_at, now() + interval '6 hours'), now() + interval '6 hours')
where status = 'completed'
  and confirmation_state = 'pending'
  and auto_confirm_at is not null
  and auto_confirm_at > now() + interval '6 hours';

-- ── 2. In-app notifications (one row per user per match, idempotent) ─────────

create table if not exists user_notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create index if not exists user_notifications_user_unread_idx
  on user_notifications (user_id, created_at desc)
  where read_at is null;

alter table user_notifications enable row level security;

create policy "user_notifications_select_own" on user_notifications
  for select using (auth.uid() = user_id);

create policy "user_notifications_update_own" on user_notifications
  for update using (auth.uid() = user_id);

-- ── 3. Notify everyone on the roster when a match hits `completed` ───────────

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

  sport_label := initcap(replace(new.sport::text, '_', ' '));

  body := format(
    '%s: %s vs %s was recorded. Open the match to confirm or dispute. If you take no action, it auto-confirms in 6 hours.',
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

drop trigger if exists matches_notify_completed on matches;
create trigger matches_notify_completed
  after insert or update on matches
  for each row execute procedure notify_match_participants_completed();
