-- ============================================================================
-- 044_school_member_role_rls.sql
--   Enforce school View/Edit/Admin roles at the database layer.
--
--   Roles:
--   - admin: manage school data and access
--   - teacher: edit school sports data
--   - scorer: view only
-- ============================================================================

drop policy if exists school_members_select_member on public.school_members;
drop policy if exists school_members_insert_admin on public.school_members;
drop policy if exists school_members_update_admin on public.school_members;
drop policy if exists school_members_delete_admin on public.school_members;

create policy school_members_select_member on public.school_members
  for select using (user_id = auth.uid());

create policy school_members_insert_admin on public.school_members
  for insert with check (
    (
      user_id = auth.uid()
      and exists (
        select 1 from public.schools s
        where s.id = school_members.school_id
          and s.created_by = auth.uid()
      )
    )
    or exists (
      select 1 from public.school_members sm
      where sm.school_id = school_members.school_id
        and sm.user_id = auth.uid()
        and sm.role = 'admin'
    )
  );

drop policy if exists school_houses_all_member on public.school_houses;
drop policy if exists school_houses_select_member on public.school_houses;
drop policy if exists school_houses_write_editor on public.school_houses;
drop policy if exists school_classes_all_member on public.school_classes;
drop policy if exists school_classes_select_member on public.school_classes;
drop policy if exists school_classes_write_editor on public.school_classes;
drop policy if exists school_students_all_member on public.school_students;
drop policy if exists school_students_select_member on public.school_students;
drop policy if exists school_students_write_editor on public.school_students;
drop policy if exists school_meets_all_member on public.school_meets;
drop policy if exists school_meets_select_member on public.school_meets;
drop policy if exists school_meets_write_editor on public.school_meets;
drop policy if exists school_meet_events_all_member on public.school_meet_events;
drop policy if exists school_meet_events_select_member on public.school_meet_events;
drop policy if exists school_meet_events_write_editor on public.school_meet_events;
drop policy if exists school_event_results_all_member on public.school_event_results;
drop policy if exists school_event_results_select_member on public.school_event_results;
drop policy if exists school_event_results_write_editor on public.school_event_results;

create policy school_houses_select_member on public.school_houses
  for select using (exists (
    select 1 from public.school_members sm
    where sm.school_id = school_houses.school_id and sm.user_id = auth.uid()
  ));

create policy school_houses_write_editor on public.school_houses
  for all using (exists (
    select 1 from public.school_members sm
    where sm.school_id = school_houses.school_id
      and sm.user_id = auth.uid()
      and sm.role in ('admin', 'teacher')
  )) with check (exists (
    select 1 from public.school_members sm
    where sm.school_id = school_houses.school_id
      and sm.user_id = auth.uid()
      and sm.role in ('admin', 'teacher')
  ));

create policy school_classes_select_member on public.school_classes
  for select using (exists (
    select 1 from public.school_members sm
    where sm.school_id = school_classes.school_id and sm.user_id = auth.uid()
  ));

create policy school_classes_write_editor on public.school_classes
  for all using (exists (
    select 1 from public.school_members sm
    where sm.school_id = school_classes.school_id
      and sm.user_id = auth.uid()
      and sm.role in ('admin', 'teacher')
  )) with check (exists (
    select 1 from public.school_members sm
    where sm.school_id = school_classes.school_id
      and sm.user_id = auth.uid()
      and sm.role in ('admin', 'teacher')
  ));

create policy school_students_select_member on public.school_students
  for select using (exists (
    select 1 from public.school_members sm
    where sm.school_id = school_students.school_id and sm.user_id = auth.uid()
  ));

create policy school_students_write_editor on public.school_students
  for all using (exists (
    select 1 from public.school_members sm
    where sm.school_id = school_students.school_id
      and sm.user_id = auth.uid()
      and sm.role in ('admin', 'teacher')
  )) with check (exists (
    select 1 from public.school_members sm
    where sm.school_id = school_students.school_id
      and sm.user_id = auth.uid()
      and sm.role in ('admin', 'teacher')
  ));

create policy school_meets_select_member on public.school_meets
  for select using (exists (
    select 1 from public.school_members sm
    where sm.school_id = school_meets.school_id and sm.user_id = auth.uid()
  ));

create policy school_meets_write_editor on public.school_meets
  for all using (exists (
    select 1 from public.school_members sm
    where sm.school_id = school_meets.school_id
      and sm.user_id = auth.uid()
      and sm.role in ('admin', 'teacher')
  )) with check (exists (
    select 1 from public.school_members sm
    where sm.school_id = school_meets.school_id
      and sm.user_id = auth.uid()
      and sm.role in ('admin', 'teacher')
  ));

create policy school_meet_events_select_member on public.school_meet_events
  for select using (exists (
    select 1 from public.school_members sm
    where sm.school_id = school_meet_events.school_id and sm.user_id = auth.uid()
  ));

create policy school_meet_events_write_editor on public.school_meet_events
  for all using (exists (
    select 1 from public.school_members sm
    where sm.school_id = school_meet_events.school_id
      and sm.user_id = auth.uid()
      and sm.role in ('admin', 'teacher')
  )) with check (exists (
    select 1 from public.school_members sm
    where sm.school_id = school_meet_events.school_id
      and sm.user_id = auth.uid()
      and sm.role in ('admin', 'teacher')
  ));

create policy school_event_results_select_member on public.school_event_results
  for select using (exists (
    select 1 from public.school_members sm
    where sm.school_id = school_event_results.school_id and sm.user_id = auth.uid()
  ));

create policy school_event_results_write_editor on public.school_event_results
  for all using (exists (
    select 1 from public.school_members sm
    where sm.school_id = school_event_results.school_id
      and sm.user_id = auth.uid()
      and sm.role in ('admin', 'teacher')
  )) with check (exists (
    select 1 from public.school_members sm
    where sm.school_id = school_event_results.school_id
      and sm.user_id = auth.uid()
      and sm.role in ('admin', 'teacher')
  ));
