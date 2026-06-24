-- Allow a school creator to read the school row before the school_members row
-- exists. This fixes create-school flows that use INSERT ... RETURNING.

drop policy if exists schools_select_member on public.schools;

create policy schools_select_member on public.schools
  for select using (
    created_by = auth.uid()
    or exists (
      select 1 from public.school_members sm
      where sm.school_id = schools.id and sm.user_id = auth.uid()
    )
  );
