-- ============================================================================
-- 034_push_subscriptions.sql
--   Web Push subscription endpoints, used by the "Need Players Now" fan-out
--   and any other future notification path.
--
--   We keep one row per (user, endpoint) — a user with the app installed on
--   multiple devices ends up with multiple rows. The endpoint URL is the
--   primary unique key (it already encodes the device + push service).
--
--   Why a column for `failed_at` instead of deleting on first failure:
--     Push services sometimes return 410 Gone for transient reasons. We
--     mark + retry; the fan-out function deletes rows that have failed
--     multiple consecutive times.
-- ============================================================================

create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,   -- public key from PushSubscription.toJSON().keys.p256dh
  auth          text not null,   -- shared secret from .keys.auth
  user_agent    text,            -- diagnostic only
  failed_at     timestamptz,
  failure_count int  not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subs_read_own"   on public.push_subscriptions;
drop policy if exists "push_subs_insert_own" on public.push_subscriptions;
drop policy if exists "push_subs_delete_own" on public.push_subscriptions;
drop policy if exists "push_subs_update_own" on public.push_subscriptions;

create policy "push_subs_read_own"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "push_subs_insert_own"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "push_subs_delete_own"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

create policy "push_subs_update_own"
  on public.push_subscriptions for update
  using (auth.uid() = user_id);
