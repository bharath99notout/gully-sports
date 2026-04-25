-- ============================================================================
-- 013_match_confirmations.sql
-- Trust model: matches must be confirmed (or auto-confirmed after 24h) by the
-- non-scoring participants. Disputes route back to the scorer; force-pushed
-- matches reach an admin queue.
--
-- States:
--   pending       — match completed, awaiting participant confirmations
--   confirmed     — all responded participants confirmed, OR auto-confirm hit
--   disputed      — at least one participant disputed; scorer must recheck
--   force_pushed  — scorer insists; pending admin review
--   rejected      — admin rejected; stats excluded (same as non-confirmed)
-- ============================================================================

-- ── 1. Schema additions ──────────────────────────────────────────────────────

alter table profiles
  add column if not exists is_admin boolean not null default false;

alter table matches
  add column if not exists confirmation_state text not null default 'pending'
    check (confirmation_state in ('pending','confirmed','disputed','force_pushed','rejected')),
  add column if not exists auto_confirm_at timestamptz,
  add column if not exists scored_by uuid references profiles(id) on delete set null;

create index if not exists matches_auto_confirm_at_idx
  on matches (auto_confirm_at)
  where confirmation_state = 'pending';

create index if not exists matches_confirmation_state_idx
  on matches (confirmation_state);

-- Per-participant confirmation row (one per player per match)
create table if not exists match_confirmations (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','confirmed','disputed')),
  disputed_reason text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index if not exists match_confirmations_player_id_idx
  on match_confirmations (player_id, status);

-- Audit trail of admin decisions for force-pushed matches
create table if not exists match_admin_actions (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references matches(id) on delete cascade,
  admin_id uuid not null references profiles(id) on delete set null,
  action text not null check (action in ('approve','reject')),
  notes text,
  created_at timestamptz not null default now()
);

-- ── 2. Trigger: seed match_confirmations when a match becomes 'completed' ───
--
-- Runs once per match (when status flips to 'completed'). Inserts one
-- 'pending' row for every match_player except the scorer (auto-counted as
-- confirmed) and sets auto_confirm_at = now() + 24h.

create or replace function seed_match_confirmations()
returns trigger as $$
begin
  -- Only fire on the transition into 'completed' (or if completed at insert)
  if (tg_op = 'INSERT' and new.status = 'completed')
     or (tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'completed')
  then
    -- Backfill scored_by if scorer didn't supply it explicitly
    if new.scored_by is null then
      new.scored_by := coalesce(new.scored_by, new.created_by);
    end if;

    new.confirmation_state := 'pending';
    new.auto_confirm_at := now() + interval '24 hours';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists matches_seed_confirmations_before on matches;
create trigger matches_seed_confirmations_before
  before insert or update on matches
  for each row execute procedure seed_match_confirmations();

-- AFTER trigger inserts the per-player rows. Separated from the BEFORE
-- trigger so we can rely on `new.id` and avoid recursive update.
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

drop trigger if exists matches_insert_confirmation_rows on matches;
create trigger matches_insert_confirmation_rows
  after insert or update on matches
  for each row execute procedure insert_match_confirmation_rows();

-- ── 3. Aggregate confirmation_state from per-player rows ────────────────────
--
-- Whenever a participant confirms/disputes, recompute the match-level state.
-- Rules:
--   • any disputed → 'disputed'
--   • all responded confirmed → 'confirmed'
--   • else                    → 'pending'
-- Force-pushed and rejected states are set explicitly elsewhere; this
-- function never overrides them.

create or replace function recompute_match_confirmation_state()
returns trigger
security definer
set search_path = public
as $$
declare
  v_match_id uuid := coalesce(new.match_id, old.match_id);
  v_current  text;
  v_pending  int;
  v_disputed int;
  v_total    int;
  v_new_state text;
begin
  select confirmation_state into v_current from matches where id = v_match_id;

  -- Don't override admin/scorer decisions
  if v_current in ('force_pushed','rejected') then
    return coalesce(new, old);
  end if;

  select
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'disputed'),
    count(*)
  into v_pending, v_disputed, v_total
  from match_confirmations
  where match_id = v_match_id;

  if v_disputed > 0 then
    v_new_state := 'disputed';
  elsif v_total > 0 and v_pending = 0 then
    v_new_state := 'confirmed';
  else
    v_new_state := 'pending';
  end if;

  if v_new_state is distinct from v_current then
    update matches set confirmation_state = v_new_state where id = v_match_id;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists match_confirmations_recompute on match_confirmations;
create trigger match_confirmations_recompute
  after insert or update or delete on match_confirmations
  for each row execute procedure recompute_match_confirmation_state();

-- ── 4. Auto-confirm sweep ────────────────────────────────────────────────────
--
-- Flips any 'pending' match older than auto_confirm_at to 'confirmed' and
-- resolves all its still-pending participant rows. Called from the app on
-- read (cheap because the index is partial) until pg_cron is set up.

create or replace function sweep_auto_confirms()
returns int as $$
declare
  swept int;
begin
  with matured as (
    select id from matches
    where confirmation_state = 'pending'
      and auto_confirm_at is not null
      and auto_confirm_at <= now()
  ), upd_rows as (
    update match_confirmations mc
    set status = 'confirmed', responded_at = now()
    from matured m
    where mc.match_id = m.id and mc.status = 'pending'
    returning 1
  )
  select count(*)::int into swept from upd_rows;

  update matches
  set confirmation_state = 'confirmed'
  where confirmation_state = 'pending'
    and auto_confirm_at is not null
    and auto_confirm_at <= now();

  return swept;
end;
$$ language plpgsql security definer;

-- ── 4b. When the scorer edits a disputed match, reset confirmations ────────
--
-- Any change to match_scores OR to a match's winner_team_id while the match
-- is in 'disputed' state means the scorer has rechecked. We reset all
-- non-scorer confirmations back to 'pending' so participants can re-evaluate.

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
    -- The aggregation trigger on match_confirmations will flip the match
    -- back to 'pending'. Reset the auto-confirm window too so participants
    -- get a fresh 24h to respond to the corrected score.
    update matches set auto_confirm_at = now() + interval '24 hours'
    where id = v_match_id;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists match_scores_reset_dispute on match_scores;
create trigger match_scores_reset_dispute
  after update on match_scores
  for each row execute procedure reset_dispute_on_recheck();

-- Also catch winner changes on the matches table (cricket end, badminton end)
drop trigger if exists matches_reset_dispute on matches;
create trigger matches_reset_dispute
  after update of winner_team_id, winner_team_name on matches
  for each row execute procedure reset_dispute_on_recheck();

-- ── 5. Backfill — existing matches predate this migration, treat as confirmed
update matches
set confirmation_state = 'confirmed', auto_confirm_at = now()
where status = 'completed' and confirmation_state = 'pending';

-- Seed confirmation rows for past completed matches (all confirmed)
insert into match_confirmations (match_id, player_id, status, responded_at)
select mp.match_id, mp.player_id, 'confirmed', now()
from match_players mp
join matches m on m.id = mp.match_id
where m.status = 'completed'
  and m.confirmation_state = 'confirmed'
on conflict (match_id, player_id) do nothing;

-- ── 6. RLS ───────────────────────────────────────────────────────────────────

alter table match_confirmations enable row level security;
alter table match_admin_actions enable row level security;

-- Anyone can read confirmation state (for badges)
create policy "match_confirmations_read_all" on match_confirmations
  for select using (true);

-- Only the participant can insert their own row (triggered by the BEFORE
-- trigger but allow manual reseeding too) and only the participant can
-- update their own status.
create policy "match_confirmations_insert_self" on match_confirmations
  for insert with check (auth.uid() = player_id);
create policy "match_confirmations_update_self" on match_confirmations
  for update using (auth.uid() = player_id);

-- Admin actions: anyone can read, only admins can write
create policy "match_admin_actions_read_all" on match_admin_actions
  for select using (true);
create policy "match_admin_actions_insert_admin" on match_admin_actions
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );
