-- Backfill phone from email for all existing users who signed up via phone
-- (email stored as {phone}@live.com internally)
UPDATE public.profiles p
SET phone = split_part(u.email, '@', 1)
FROM auth.users u
WHERE p.id = u.id
  AND p.phone IS NULL
  AND u.email LIKE '%@live.com'
  AND split_part(u.email, '@', 1) ~ '^\d+$';

-- Update trigger so new users auto-get phone saved on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phone text;
BEGIN
  v_phone := CASE
    WHEN NEW.email LIKE '%@live.com' AND split_part(NEW.email, '@', 1) ~ '^\d+$'
    THEN split_part(NEW.email, '@', 1)
    ELSE NULL
  END;

  INSERT INTO public.profiles (id, name, avatar_url, phone)
  VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), ''), NULL, v_phone)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
