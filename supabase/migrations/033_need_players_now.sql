-- ============================================================================
-- 033_need_players_now.sql
--   "Need Players Now" — geo-aware real-time pickup requests.
--
--   A host posts a pickup request (sport, ground, slots needed, start time);
--   nearby opted-in players see it on their dashboard and can ask to join;
--   the host approves/declines.
--
--   Distance queries use Haversine on raw lat/lng — no PostGIS / earthdistance
--   extension dependency, which keeps this migration portable and safe to run
--   on any Supabase project.
-- ============================================================================

-- ── 1. pickup_requests ────────────────────────────────────────────────────────

create table if not exists public.pickup_requests (
  id              uuid primary key default gen_random_uuid(),
  host_id         uuid not null references public.profiles(id) on delete cascade,
  sport           sport_type not null,
  ground_name     text not null,
  ground_lat      double precision not null,
  ground_lng      double precision not null,
  slots_total     int  not null check (slots_total between 1 and 15),
  format          text,
  notes           text,
  start_time      timestamptz not null,
  expires_at      timestamptz not null,
  status          text not null default 'open'
                    check (status in ('open','filled','cancelled','expired')),
  match_id        uuid references public.matches(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- Hot path: dashboard rail asks "open pickups in next 6 hours, sorted by time".
create index if not exists pickup_requests_open_time_idx
  on public.pickup_requests(start_time)
  where status = 'open';

-- Profile lookup: "my pickups" page filters by host.
create index if not exists pickup_requests_host_idx
  on public.pickup_requests(host_id, created_at desc);

alter table public.pickup_requests enable row level security;

drop policy if exists "pickup_requests_read_all"   on public.pickup_requests;
drop policy if exists "pickup_requests_insert_own" on public.pickup_requests;
drop policy if exists "pickup_requests_update_own" on public.pickup_requests;
drop policy if exists "pickup_requests_delete_own" on public.pickup_requests;

-- Public feed by design (BRD §11 / phase MVP) — any signed-in user can see open pings.
create policy "pickup_requests_read_all"
  on public.pickup_requests for select using (true);

create policy "pickup_requests_insert_own"
  on public.pickup_requests for insert
  with check (auth.uid() = host_id);

create policy "pickup_requests_update_own"
  on public.pickup_requests for update
  using (auth.uid() = host_id);

create policy "pickup_requests_delete_own"
  on public.pickup_requests for delete
  using (auth.uid() = host_id);


-- ── 2. pickup_responses ──────────────────────────────────────────────────────

create table if not exists public.pickup_responses (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.pickup_requests(id) on delete cascade,
  joiner_id    uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'requested'
                 check (status in ('requested','accepted','declined','withdrew','no_show','showed_up')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  unique (request_id, joiner_id)
);

create index if not exists pickup_responses_request_idx
  on public.pickup_responses(request_id);
create index if not exists pickup_responses_joiner_idx
  on public.pickup_responses(joiner_id, created_at desc);

alter table public.pickup_responses enable row level security;

drop policy if exists "pickup_responses_read_all"           on public.pickup_responses;
drop policy if exists "pickup_responses_insert_own"         on public.pickup_responses;
drop policy if exists "pickup_responses_update_joiner_self" on public.pickup_responses;
drop policy if exists "pickup_responses_update_host"        on public.pickup_responses;

-- Read: anyone signed in can see who responded — useful for "5/6 filled" UI.
-- Phone numbers stay private via column-level decision at app layer.
create policy "pickup_responses_read_all"
  on public.pickup_responses for select using (true);

create policy "pickup_responses_insert_own"
  on public.pickup_responses for insert
  with check (auth.uid() = joiner_id);

-- Joiner can withdraw their own response.
create policy "pickup_responses_update_joiner_self"
  on public.pickup_responses for update
  using (auth.uid() = joiner_id);

-- Host can approve/decline responses to their own request.
create policy "pickup_responses_update_host"
  on public.pickup_responses for update
  using (
    exists (
      select 1 from public.pickup_requests pr
      where pr.id = pickup_responses.request_id
        and pr.host_id = auth.uid()
    )
  );


-- ── 3. profiles columns (pickup preferences) ──────────────────────────────────

alter table public.profiles
  add column if not exists pickup_opt_in           boolean not null default false,
  add column if not exists pickup_radius_km        int     not null default 5
    check (pickup_radius_km between 1 and 50),
  add column if not exists pickup_sports           sport_type[] not null default '{}',
  add column if not exists pickup_quiet_start      time    not null default '22:00',
  add column if not exists pickup_quiet_end        time    not null default '07:00',
  add column if not exists pickup_caliber_filter   int     not null default 0
    check (pickup_caliber_filter between 0 and 100),
  add column if not exists pickup_last_notified_at timestamptz,
  add column if not exists reliability_no_shows    int     not null default 0;

-- Used by the push-fan-out function: "find opt-in users not yet notified in 30 min".
create index if not exists profiles_pickup_optin_idx
  on public.profiles(pickup_opt_in)
  where pickup_opt_in = true;


-- ── 4. Distance helper (Haversine, returns km) ───────────────────────────────

create or replace function public.pickup_distance_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable parallel safe as $$
  select 2 * 6371 * asin(
    sqrt(
      sin(radians((lat2 - lat1) / 2)) ^ 2
      + cos(radians(lat1)) * cos(radians(lat2))
      * sin(radians((lng2 - lng1) / 2)) ^ 2
    )
  );
$$;


-- ── 5. Expiry sweeper (idempotent — call from cron / on read) ────────────────
--   We don't run pg_cron in this project; instead, server code calls this at
--   the start of nearby-pickups queries (cheap: a single UPDATE on an indexed
--   subset). This keeps stale "open" rows from cluttering the feed.

create or replace function public.pickup_expire_stale()
returns int
language plpgsql security definer as $$
declare
  v_count int;
begin
  update public.pickup_requests
     set status = 'expired'
   where status = 'open'
     and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.pickup_expire_stale() from public;
grant execute on function public.pickup_expire_stale() to authenticated;
