# GullySports — Setup & Status Guide

## Auth Flow (How It Works)

Phone number + last 4 digits as OTP. No SMS provider needed.

### Flow A — Returning user with name already set
```
Login → enter phone → enter OTP → getDestination() checks profile name
→ name is set → window.location.href = '/dashboard' ✓
```

### Flow B — User with no name (first login or old account)
```
Login → enter phone → enter OTP → getDestination() checks profile name
→ name is empty → window.location.href = '/auth/signup'
→ signup page detects session on load → skips to name step (no phone/OTP again)
→ user enters name → UPDATE profiles SET name = ...
→ window.location.href = '/dashboard' ✓
```

### Flow C — Brand new user (first time ever)
```
Login → enter phone → enter OTP → signInWithPassword fails (no account)
→ signUp creates account → window.location.href = '/auth/signup'
→ signup page: phone → OTP → name → UPDATE profiles
→ window.location.href = '/dashboard' ✓
```

### Key rules
- Dashboard **never** redirects to signup. Routing decision is made once in the login page.
- Profile name is saved with `UPDATE` (not `upsert`) — upsert hits INSERT RLS block.
- `getDestination()` in login checks: empty name or numeric-only name → `/auth/signup`, else → `/dashboard`.

### Internal mechanism
- Phone `9876543210` → stored as email `9876543210@live.com`, password `543210` (last 6 digits)
- OTP validated client-side: `otp === phone.slice(-4)` (last 4 digits)
- No SMS sent, no email sent to the user ever

---

## Required Supabase Settings

### 1. Email Provider — MUST BE ENABLED
```
Supabase Dashboard → Authentication → Providers → Email
✅ Enable Email provider → ON
✅ Confirm email → OFF  (no email is ever sent)
```

### 2. Storage Bucket for Avatars
```
Supabase Dashboard → Storage → New bucket
Name: avatars
Public: YES
```
Then run in SQL Editor:
```sql
CREATE POLICY "Users can upload own avatar" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own avatar" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Avatars are publicly readable" ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');
```

---

## SQL Migrations (Run in Order in Supabase SQL Editor)

### Migration 001 — Initial Schema
File: `supabase/migrations/001_initial_schema.sql`

### Migration 002 — Fix Trigger
File: `supabase/migrations/002_fix_trigger.sql`

### Migration 003 — Cricket Player Scoring
File: `supabase/migrations/003_cricket_player_scoring.sql`

### Migration 004 — Phone Auth
File: `supabase/migrations/004_phone_auth.sql`

### Migration 007 — Backfill Phone Numbers ⚠️ RUN THIS (fixes player search)
File: `supabase/migrations/007_backfill_phone.sql`

Populates `profiles.phone` from `auth.users.email` for all existing users.
Without this, searching players by mobile number returns no results.
Also updates the trigger so new signups auto-save their phone.

---

### Migration 006 — Innings Tracking ⚠️ RUN THIS
File: `supabase/migrations/006_innings_tracking.sql`

Adds `current_innings` column to track 1st/2nd innings in cricket:
```sql
ALTER TABLE matches ADD COLUMN IF NOT EXISTS current_innings integer DEFAULT 1;
```

---

### Migration 005 — Fix Profile Name Trigger ⚠️ RUN THIS
File: `supabase/migrations/005_fix_profile_name_trigger.sql`

Fixes existing accounts that have phone number as their name:
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, avatar_url)
  VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), ''), NULL)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

UPDATE profiles SET name = '' WHERE name ~ '^\d+$';
```

---

## Dev Server
```bash
PATH="/Users/bharath8.kumar/.nvm/versions/node/v20.20.0/bin:$PATH" npm run dev -- --port 3001
```
Runs at: http://localhost:3001

---

## Environment Variables (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=https://pkpuaznejjlyelgjzbst.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_C-1TVbEWXO7OTVf6sXjQEA_iKsU-MUx
```

---

## Deployment (Vercel)
1. Push to GitHub: `git push origin main`
2. Import repo on vercel.com
3. Add env vars: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. After deploy: Supabase → Authentication → URL Configuration → add Vercel URL

---

## Known Issues Fixed

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Profile name showing phone number | Trigger used `split_part(email, '@', 1)` | Migration 005 clears numeric names |
| Login redirects back to login | `router.push` navigates before cookie is written | Use `window.location.href` for full reload |
| Sign in → stuck on signup loop | Dashboard redirected to signup, middleware sent back to dashboard | Removed redirect from dashboard; login routes directly |
| Name never saved on signup | `upsert` attempts INSERT which is blocked by RLS (INSERT policy dropped in migration 002) | Changed to `UPDATE` which has a valid RLS policy |
| Avatar upload 403 | No RLS policies on storage bucket | Added INSERT/UPDATE/SELECT policies on `storage.objects` |
