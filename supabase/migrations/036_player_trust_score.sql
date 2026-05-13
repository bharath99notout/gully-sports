-- ============================================================================
-- 036_player_trust_score.sql
--   Player Trust Score MVP.
--
--   Signals used:
--     - Attendance: confirmed scored matches + pickup show/no-show marks.
--     - Cancellation: pickup withdrawals and no-shows.
--     - Payment: event cost assignments marked paid.
--     - Peer rating: post-match 1-5 ratings from other participants.
--     - Skill verification: confidence from confirmed recorded matches.
--
--   New users stay neutral at 60 until enough real signals exist.
-- ============================================================================

-- ── 1. Peer ratings ─────────────────────────────────────────────────────────

create table if not exists public.player_peer_ratings (
  id           uuid primary key default uuid_generate_v4(),
  match_id     uuid not null references public.matches(id) on delete cascade,
  reviewer_id  uuid not null references public.profiles(id) on delete cascade,
  player_id    uuid not null references public.profiles(id) on delete cascade,
  rating       int  not null check (rating between 1 and 5),
  tags         text[] not null default '{}',
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (match_id, reviewer_id, player_id),
  check (reviewer_id <> player_id)
);

create index if not exists player_peer_ratings_player_idx
  on public.player_peer_ratings(player_id, created_at desc);

create index if not exists player_peer_ratings_reviewer_match_idx
  on public.player_peer_ratings(reviewer_id, match_id);

create or replace function public.touch_player_peer_ratings_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists player_peer_ratings_touch_updated_at on public.player_peer_ratings;
create trigger player_peer_ratings_touch_updated_at
  before update on public.player_peer_ratings
  for each row execute procedure public.touch_player_peer_ratings_updated_at();

alter table public.player_peer_ratings enable row level security;

drop policy if exists player_peer_ratings_read_all on public.player_peer_ratings;
drop policy if exists player_peer_ratings_insert_self on public.player_peer_ratings;
drop policy if exists player_peer_ratings_update_self on public.player_peer_ratings;
drop policy if exists player_peer_ratings_delete_self on public.player_peer_ratings;

create policy player_peer_ratings_read_all
  on public.player_peer_ratings for select using (true);

create policy player_peer_ratings_insert_self
  on public.player_peer_ratings for insert with check (
    auth.uid() = reviewer_id
    and reviewer_id <> player_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.status = 'completed'
        and m.confirmation_state = 'confirmed'
    )
    and exists (
      select 1 from public.match_players mp
      where mp.match_id = player_peer_ratings.match_id
        and mp.player_id = reviewer_id
    )
    and exists (
      select 1 from public.match_players mp
      where mp.match_id = player_peer_ratings.match_id
        and mp.player_id = player_peer_ratings.player_id
    )
  );

create policy player_peer_ratings_update_self
  on public.player_peer_ratings for update using (auth.uid() = reviewer_id)
  with check (
    auth.uid() = reviewer_id
    and reviewer_id <> player_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.status = 'completed'
        and m.confirmation_state = 'confirmed'
    )
    and exists (
      select 1 from public.match_players mp
      where mp.match_id = player_peer_ratings.match_id
        and mp.player_id = reviewer_id
    )
    and exists (
      select 1 from public.match_players mp
      where mp.match_id = player_peer_ratings.match_id
        and mp.player_id = player_peer_ratings.player_id
    )
  );

create policy player_peer_ratings_delete_self
  on public.player_peer_ratings for delete using (auth.uid() = reviewer_id);

grant select on public.player_peer_ratings to anon, authenticated;
grant insert, update, delete on public.player_peer_ratings to authenticated;


-- ── 2. Trust-score read model ───────────────────────────────────────────────

create or replace view public.player_trust_scores as
with confirmed_match_participation as (
  select
    mp.player_id,
    count(distinct mp.match_id)::int as confirmed_matches
  from public.match_players mp
  join public.matches m on m.id = mp.match_id
  where m.status = 'completed'
    and coalesce(m.confirmation_state, 'confirmed') = 'confirmed'
  group by mp.player_id
),
pickup_signal as (
  select
    pr.joiner_id as player_id,
    count(*) filter (where pr.status = 'showed_up')::int as pickup_showed_up,
    count(*) filter (where pr.status = 'no_show')::int as pickup_no_shows,
    count(*) filter (where pr.status = 'withdrew')::int as pickup_withdrawals
  from public.pickup_responses pr
  group by pr.joiner_id
),
payment_signal as (
  select
    eca.player_id,
    count(*) filter (where eca.amount_paise > 0)::int as payment_assignments,
    count(*) filter (where eca.amount_paise > 0 and eca.paid)::int as paid_assignments
  from public.event_cost_assignments eca
  group by eca.player_id
),
peer_signal as (
  select
    ppr.player_id,
    avg(ppr.rating)::numeric as avg_rating,
    count(*)::int as peer_ratings_count
  from public.player_peer_ratings ppr
  group by ppr.player_id
),
signals as (
  select
    p.id as player_id,
    coalesce(cmp.confirmed_matches, 0) as confirmed_matches,
    coalesce(ps.pickup_showed_up, 0) as pickup_showed_up,
    greatest(coalesce(ps.pickup_no_shows, 0), coalesce(p.reliability_no_shows, 0)) as pickup_no_shows,
    coalesce(ps.pickup_withdrawals, 0) as pickup_withdrawals,
    coalesce(pay.payment_assignments, 0) as payment_assignments,
    coalesce(pay.paid_assignments, 0) as paid_assignments,
    coalesce(peer.avg_rating, null) as avg_peer_rating,
    coalesce(peer.peer_ratings_count, 0) as peer_ratings_count
  from public.profiles p
  left join confirmed_match_participation cmp on cmp.player_id = p.id
  left join pickup_signal ps on ps.player_id = p.id
  left join payment_signal pay on pay.player_id = p.id
  left join peer_signal peer on peer.player_id = p.id
),
component_scores as (
  select
    s.*,
    (s.confirmed_matches + s.pickup_showed_up + s.pickup_no_shows) as attendance_events,
    (s.pickup_showed_up + s.pickup_no_shows + s.pickup_withdrawals) as pickup_commitment_events,
    case
      when (s.confirmed_matches + s.pickup_showed_up + s.pickup_no_shows) = 0 then 60
      else round(
        ((s.confirmed_matches + s.pickup_showed_up)::numeric
          / nullif((s.confirmed_matches + s.pickup_showed_up + s.pickup_no_shows), 0)) * 100
      )::int
    end as attendance_score,
    case
      when (s.pickup_showed_up + s.pickup_no_shows + s.pickup_withdrawals) = 0 then 60
      else greatest(
        0,
        round(
          100 - least(
            100,
            ((s.pickup_no_shows * 45 + s.pickup_withdrawals * 18)::numeric
              / nullif((s.pickup_showed_up + s.pickup_no_shows + s.pickup_withdrawals), 0))
          )
        )::int
      )
    end as cancellation_score,
    case
      when s.payment_assignments = 0 then 60
      else round((s.paid_assignments::numeric / nullif(s.payment_assignments, 0)) * 100)::int
    end as payment_score,
    case
      when s.peer_ratings_count = 0 then 60
      else round((s.avg_peer_rating / 5) * 100)::int
    end as peer_score,
    least(100, 60 + (s.confirmed_matches * 8))::int as skill_score
  from signals s
),
final_scores as (
  select
    cs.*,
    round(
      cs.attendance_score * 0.35
      + cs.cancellation_score * 0.25
      + cs.payment_score * 0.20
      + cs.peer_score * 0.10
      + cs.skill_score * 0.10
    )::int as score
  from component_scores cs
)
select
  fs.player_id,
  fs.score,
  case
    when fs.score >= 90 then 'Elite Reliable'
    when fs.score >= 75 then 'Highly Reliable'
    when fs.score >= 60 then 'Reliable'
    when fs.score >= 40 then 'Building Trust'
    else 'Limited Access'
  end as tier,
  fs.attendance_score,
  fs.cancellation_score,
  fs.payment_score,
  fs.peer_score,
  fs.skill_score,
  fs.confirmed_matches as matches_counted,
  fs.attendance_events,
  fs.pickup_commitment_events,
  fs.payment_assignments,
  fs.peer_ratings_count,
  fs.pickup_no_shows as no_shows,
  fs.pickup_withdrawals as cancellations,
  (
    fs.attendance_events
    + fs.pickup_withdrawals
    + fs.payment_assignments
    + fs.peer_ratings_count
  ) < 5 as low_data
from final_scores fs;

grant select on public.player_trust_scores to anon, authenticated;
