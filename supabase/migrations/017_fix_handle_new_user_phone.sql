-- Update handle_new_user so profiles.phone is also populated when the auth
-- user was created via phone identity (admin.createUser({ phone })) — not just
-- via the legacy <digits>@live.com email hack.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phone text;
BEGIN
  v_phone := CASE
    WHEN NEW.phone IS NOT NULL AND NEW.phone <> ''
      THEN regexp_replace(NEW.phone, '^\+?91', '')
    WHEN NEW.email LIKE '%@live.com' AND split_part(NEW.email, '@', 1) ~ '^\d+$'
      THEN split_part(NEW.email, '@', 1)
    ELSE NULL
  END;

  INSERT INTO public.profiles (id, name, avatar_url, phone)
  VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), ''), NULL, v_phone)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
