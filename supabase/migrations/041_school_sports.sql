-- ============================================================================
-- 041_school_sports.sql
--   Internal school sports-day management.
--
--   Deliberately separate from matches / player_match_stats / caliber:
--   athletics results are time/height/distance based and should not affect
--   the existing GullySports skill board.
-- ============================================================================

create table if not exists public.schools (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null check (length(trim(name)) > 0),
  logo_url    text,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.school_members (
  id          uuid primary key default uuid_generate_v4(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'admin' check (role in ('admin', 'teacher', 'scorer')),
  created_at  timestamptz not null default now(),
  unique (school_id, user_id)
);

create table if not exists public.school_houses (
  id          uuid primary key default uuid_generate_v4(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  color       text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists public.school_classes (
  id          uuid primary key default uuid_generate_v4(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists public.school_students (
  id          uuid primary key default uuid_generate_v4(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete set null,
  house_id    uuid references public.school_houses(id) on delete set null,
  class_id    uuid references public.school_classes(id) on delete set null,
  name        text not null check (length(trim(name)) > 0),
  class_label text,
  gender      text not null default 'mixed' check (gender in ('boys', 'girls', 'mixed')),
  created_by  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists school_students_school_idx
  on public.school_students(school_id, name);

create index if not exists school_classes_school_sort_idx
  on public.school_classes(school_id, sort_order, name);

create index if not exists school_students_class_idx
  on public.school_students(school_id, class_id, gender, name);

create index if not exists school_students_profile_idx
  on public.school_students(profile_id)
  where profile_id is not null;

create table if not exists public.school_meets (
  id          uuid primary key default uuid_generate_v4(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  meet_date   date not null default current_date,
  status      text not null default 'draft' check (status in ('draft', 'live', 'completed')),
  created_by  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists school_meets_school_date_idx
  on public.school_meets(school_id, meet_date desc);

create table if not exists public.school_meet_events (
  id              uuid primary key default uuid_generate_v4(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  meet_id         uuid not null references public.school_meets(id) on delete cascade,
  event_key       text not null,
  name            text not null,
  event_type      text not null check (event_type in ('track', 'field')),
  result_metric   text not null check (result_metric in ('time_seconds', 'distance_cm', 'height_cm')),
  gender_category text not null default 'mixed' check (gender_category in ('boys', 'girls', 'mixed')),
  class_id        uuid references public.school_classes(id) on delete set null,
  class_group     text,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  unique (meet_id, event_key, gender_category, class_group)
);

create index if not exists school_meet_events_meet_idx
  on public.school_meet_events(meet_id, sort_order);

create index if not exists school_meet_events_class_idx
  on public.school_meet_events(meet_id, class_id, gender_category, sort_order);

create table if not exists public.school_event_results (
  id            uuid primary key default uuid_generate_v4(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  meet_id       uuid not null references public.school_meets(id) on delete cascade,
  event_id      uuid not null references public.school_meet_events(id) on delete cascade,
  student_id    uuid not null references public.school_students(id) on delete cascade,
  result_value  numeric,
  rank          int,
  medal         text check (medal in ('gold', 'silver', 'bronze')),
  points        numeric not null default 0,
  notes         text,
  updated_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (event_id, student_id)
);

create index if not exists school_event_results_event_rank_idx
  on public.school_event_results(event_id, rank);

create index if not exists school_event_results_student_idx
  on public.school_event_results(student_id, created_at desc);

alter table public.schools enable row level security;
alter table public.school_members enable row level security;
alter table public.school_houses enable row level security;
alter table public.school_classes enable row level security;
alter table public.school_students enable row level security;
alter table public.school_meets enable row level security;
alter table public.school_meet_events enable row level security;
alter table public.school_event_results enable row level security;

drop policy if exists schools_select_member on public.schools;
drop policy if exists schools_insert_self on public.schools;
drop policy if exists schools_update_admin on public.schools;
drop policy if exists school_members_select_member on public.school_members;
drop policy if exists school_members_insert_admin on public.school_members;
drop policy if exists school_houses_all_member on public.school_houses;
drop policy if exists school_classes_all_member on public.school_classes;
drop policy if exists school_students_all_member on public.school_students;
drop policy if exists school_meets_all_member on public.school_meets;
drop policy if exists school_meet_events_all_member on public.school_meet_events;
drop policy if exists school_event_results_all_member on public.school_event_results;

create policy schools_select_member on public.schools
  for select using (
    created_by = auth.uid()
    or
    exists (
      select 1 from public.school_members sm
      where sm.school_id = schools.id and sm.user_id = auth.uid()
    )
  );

create policy schools_insert_self on public.schools
  for insert with check (created_by = auth.uid());

create policy schools_update_admin on public.schools
  for update using (
    exists (
      select 1 from public.school_members sm
      where sm.school_id = schools.id and sm.user_id = auth.uid() and sm.role = 'admin'
    )
  );

create policy school_members_select_member on public.school_members
  for select using (user_id = auth.uid());

create policy school_members_insert_admin on public.school_members
  for insert with check (user_id = auth.uid());

create policy school_houses_all_member on public.school_houses
  for all using (
    exists (
      select 1 from public.school_members sm
      where sm.school_id = school_houses.school_id and sm.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.school_members sm
      where sm.school_id = school_houses.school_id and sm.user_id = auth.uid()
    )
  );

create policy school_classes_all_member on public.school_classes
  for all using (
    exists (
      select 1 from public.school_members sm
      where sm.school_id = school_classes.school_id and sm.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.school_members sm
      where sm.school_id = school_classes.school_id and sm.user_id = auth.uid()
    )
  );

create policy school_students_all_member on public.school_students
  for all using (
    exists (
      select 1 from public.school_members sm
      where sm.school_id = school_students.school_id and sm.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.school_members sm
      where sm.school_id = school_students.school_id and sm.user_id = auth.uid()
    )
  );

create policy school_meets_all_member on public.school_meets
  for all using (
    exists (
      select 1 from public.school_members sm
      where sm.school_id = school_meets.school_id and sm.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.school_members sm
      where sm.school_id = school_meets.school_id and sm.user_id = auth.uid()
    )
  );

create policy school_meet_events_all_member on public.school_meet_events
  for all using (
    exists (
      select 1 from public.school_members sm
      where sm.school_id = school_meet_events.school_id and sm.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.school_members sm
      where sm.school_id = school_meet_events.school_id and sm.user_id = auth.uid()
    )
  );

create policy school_event_results_all_member on public.school_event_results
  for all using (
    exists (
      select 1 from public.school_members sm
      where sm.school_id = school_event_results.school_id and sm.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.school_members sm
      where sm.school_id = school_event_results.school_id and sm.user_id = auth.uid()
    )
  );
