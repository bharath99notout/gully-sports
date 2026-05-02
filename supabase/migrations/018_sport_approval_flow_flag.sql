-- ============================================================================
-- 018_sport_approval_flow_flag.sql
-- Per-sport toggle for the match-confirmation/approval flow (added in 013/015).
--
-- Cricket starts disabled in production: scoring there is granular enough
-- (per-ball player_match_stats) that participants don't need to re-confirm.
-- Other sports keep the flow on.
--
-- When approval is OFF for a sport:
--   • completed matches go straight to confirmation_state='confirmed'
--   • no per-player match_confirmations rows are seeded
--   • no user_notifications are inserted
--   • auto_confirm_at stays NULL (sweep skips it naturally)
-- ============================================================================

-- ── 1. Settings table ───────────────────────────────────────────────────────

create table if not exists sport_settings (
  sport sport_type primary key,
  approval_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into sport_settings (sport, approval_enabled) values
  ('cricket', false),
  ('football', true),
  ('badminton', true),
  ('table_tennis', true)
on conflict (sport) do nothing;

alter table sport_settings enable row level security;

create policy "sport_settings_read_all" on sport_settings
  for select using (true);

create policy "sport_settings_write_admin" on sport_settings
  for all using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  ) with check (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

-- ── 2. Helper used by the three completion triggers ─────────────────────────

create or replace function approval_enabled_for_sport(p_sport sport_type)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select approval_enabled from sport_settings where sport = p_sport),
    true
  );
$$;

-- ── 3. Patch BEFORE seed trigger (013/015) — skip pending state when off ────

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
      new.auto_confirm_at := now() + interval '6 hours';
    else
      new.confirmation_state := 'confirmed';
      new.auto_confirm_at := null;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

-- ── 4. Patch AFTER row-insert trigger (013) — skip per-player rows when off ─

create or replace function insert_match_confirmation_rows()
returns trigger
security definer
set search_path = public
as $$
declare
  scorer_id uuid;
begin
  if (tg_op = 'INSERT' and new.status = 'completed')
     or (tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'completed')
  then
    if not approval_enabled_for_sport(new.sport) then
      return new;
    end if;

    scorer_id := coalesce(new.scored_by, new.created_by);

    insert into match_confirmations (match_id, player_id, status, responded_at)
    select
      new.id,
      mp.player_id,
      case when mp.player_id = scorer_id then 'confirmed' else 'pending' end,
      case when mp.player_id = scorer_id then now() else null end
    from match_players mp
    where mp.match_id = new.id
    on conflict (match_id, player_id) do nothing;
  end if;
  return new;
end;
$$ language plpgsql;

-- ── 5. Patch notify trigger (015) — no notifications when off ───────────────

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

-- ── 6. Backfill: resolve in-flight cricket matches ──────────────────────────
-- Any cricket match still pending/disputed/force_pushed at migration time is
-- promoted to confirmed. Rejected matches are left alone (admin decided).
-- Unread "needs confirmation" notifications for cricket are marked read so
-- the bell stops nagging.
--
-- Order matters: update matches FIRST (clears auto_confirm_at), then resolve
-- match_confirmations rows. If we flipped confirmation rows first the
-- recompute trigger would already promote the match to 'confirmed' and the
-- subsequent matches update — which gates on the old state — would no-op,
-- leaving auto_confirm_at as stale data on confirmed rows.

update matches
set confirmation_state = 'confirmed',
    auto_confirm_at = null
where sport = 'cricket'
  and confirmation_state in ('pending', 'disputed', 'force_pushed');

update match_confirmations mc
set status = 'confirmed',
    responded_at = coalesce(responded_at, now()),
    disputed_reason = null
from matches m
where mc.match_id = m.id
  and m.sport = 'cricket'
  and mc.status <> 'confirmed';

update user_notifications un
set read_at = now()
from matches m
where un.match_id = m.id
  and m.sport = 'cricket'
  and un.read_at is null;
