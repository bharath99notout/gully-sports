-- ============================================================================
-- 040_admin_dashboard_audit.sql
--   Lightweight admin activity tracking.
--
--   Keep this low-volume: log login/session and meaningful lifecycle events,
--   not every score tap.
-- ============================================================================

alter table public.profiles
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_login_at timestamptz;

create index if not exists profiles_last_seen_idx
  on public.profiles(last_seen_at desc);

create index if not exists profiles_last_login_idx
  on public.profiles(last_login_at desc);

create table if not exists public.user_sessions (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  login_method text not null check (login_method in ('last4', 'email', 'restored')),
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index if not exists user_sessions_user_created_idx
  on public.user_sessions(user_id, created_at desc);

create index if not exists user_sessions_created_idx
  on public.user_sessions(created_at desc);

create table if not exists public.audit_events (
  id            uuid primary key default uuid_generate_v4(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  event_type    text not null,
  entity_type   text,
  entity_id     uuid,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists audit_events_created_idx
  on public.audit_events(created_at desc);

create index if not exists audit_events_actor_created_idx
  on public.audit_events(actor_user_id, created_at desc);

create index if not exists audit_events_type_created_idx
  on public.audit_events(event_type, created_at desc);

create index if not exists audit_events_entity_idx
  on public.audit_events(entity_type, entity_id, created_at desc);

alter table public.user_sessions enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists user_sessions_select_admin on public.user_sessions;
drop policy if exists user_sessions_insert_self on public.user_sessions;
drop policy if exists audit_events_select_admin on public.audit_events;
drop policy if exists audit_events_insert_self on public.audit_events;

create policy user_sessions_select_admin
  on public.user_sessions for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

create policy user_sessions_insert_self
  on public.user_sessions for insert with check (auth.uid() = user_id);

create policy audit_events_select_admin
  on public.audit_events for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

create policy audit_events_insert_self
  on public.audit_events for insert with check (
    actor_user_id is not null and auth.uid() = actor_user_id
  );

grant select, insert on public.user_sessions to authenticated;
grant select, insert on public.audit_events to authenticated;
