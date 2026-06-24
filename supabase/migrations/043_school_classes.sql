-- ============================================================================
-- 043_school_classes.sql
--   Promote school class/standard to school-level master data and link
--   students/events by class.
-- ============================================================================

create table if not exists public.school_classes (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (school_id, name)
);

alter table public.school_classes enable row level security;

drop policy if exists school_classes_all_member on public.school_classes;

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

alter table public.school_students
  add column if not exists class_id uuid references public.school_classes(id) on delete set null;

alter table public.school_meet_events
  add column if not exists class_id uuid references public.school_classes(id) on delete set null;

create index if not exists school_classes_school_sort_idx
  on public.school_classes(school_id, sort_order, name);

create index if not exists school_students_class_idx
  on public.school_students(school_id, class_id, gender, name);

create index if not exists school_meet_events_class_idx
  on public.school_meet_events(meet_id, class_id, gender_category, sort_order);

insert into public.school_classes (school_id, name, sort_order)
select s.id, c.name, c.sort_order
from public.schools s
cross join (
  values
    ('Nursery', 0),
    ('LKG', 1),
    ('UKG', 2),
    ('1st', 3),
    ('2nd', 4),
    ('3rd', 5),
    ('4th', 6),
    ('5th', 7),
    ('6th', 8),
    ('7th', 9),
    ('8th', 10),
    ('9th', 11),
    ('10th', 12)
) as c(name, sort_order)
on conflict (school_id, name) do nothing;

insert into public.school_classes (school_id, name, sort_order)
select distinct ss.school_id, trim(ss.class_label), 100
from public.school_students ss
where ss.class_label is not null and length(trim(ss.class_label)) > 0
on conflict (school_id, name) do nothing;

update public.school_students ss
set class_id = sc.id
from public.school_classes sc
where ss.class_id is null
  and sc.school_id = ss.school_id
  and lower(sc.name) = lower(trim(ss.class_label));

update public.school_meet_events sme
set class_id = sc.id
from public.school_classes sc
where sme.class_id is null
  and sme.class_group is not null
  and sc.school_id = sme.school_id
  and lower(sc.name) = lower(trim(sme.class_group));
