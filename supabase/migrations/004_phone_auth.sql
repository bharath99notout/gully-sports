-- Allow name to be empty initially (phone users set it after OTP)
ALTER TABLE profiles ALTER COLUMN name SET DEFAULT '';

-- Update trigger to handle phone-only signups (no email, no name metadata)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      NULLIF(split_part(NEW.email, '@', 1), ''),
      ''
    ),
    NULL
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
