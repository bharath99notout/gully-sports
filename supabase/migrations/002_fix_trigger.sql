-- Drop the INSERT policy on profiles — profiles are only created by the
-- handle_new_user trigger (which runs as postgres/superuser), not by client code.
-- The old policy blocked the trigger because auth.uid() is null at signup time.
drop policy if exists "profiles_insert_own" on profiles;

-- Recreate the trigger function with explicit search_path (Supabase best practice)
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;
