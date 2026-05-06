-- ============================================================================
-- 024_event_rsvps.sql
-- Phase 1 chunk 2: RSVPs (with guest path) + invite-only allowlist.
--
-- An RSVP belongs to either a profile (player_id) or a guest (guest_phone).
-- Guests don't need to sign in to RSVP; when they later complete signup,
-- /api/auth/last4-signup links the rows to their new player_id.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_rsvps (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  player_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  guest_name    text,
  guest_phone   text,
  status        text NOT NULL CHECK (status IN ('going','maybe','not_going','waitlist')),
  responded_at  timestamptz NOT NULL DEFAULT now(),
  -- Set after the event by the host: did this person actually show up?
  attended      boolean,
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- Either a profile XOR a guest, never both, never neither.
  CONSTRAINT rsvp_actor_xor CHECK (
    (player_id IS NOT NULL AND guest_phone IS NULL AND guest_name IS NULL)
    OR
    (player_id IS NULL AND guest_phone IS NOT NULL AND guest_name IS NOT NULL)
  )
);

-- One RSVP row per (event, profile) and per (event, phone). The DB enforces
-- this so retries / double-taps from a flaky network can't double-book.
CREATE UNIQUE INDEX IF NOT EXISTS event_rsvps_event_player_uk
  ON public.event_rsvps(event_id, player_id)
  WHERE player_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_rsvps_event_phone_uk
  ON public.event_rsvps(event_id, guest_phone)
  WHERE guest_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_rsvps_event_status_idx
  ON public.event_rsvps(event_id, status);

CREATE INDEX IF NOT EXISTS event_rsvps_phone_idx
  ON public.event_rsvps(guest_phone)
  WHERE guest_phone IS NOT NULL;

-- ── Invite-only allowlist ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_invites (
  event_id    uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- Last-10-digits canonical form; matches the rest of the codebase's phone
  -- handling (auth.users.phone is +91-prefixed but business logic compares
  -- last 10 digits to be locale-agnostic).
  phone       text NOT NULL,
  invited_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, phone)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.event_rsvps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_invites  ENABLE ROW LEVEL SECURITY;

-- DROP-then-CREATE for re-run safety.
DROP POLICY IF EXISTS rsvp_select        ON public.event_rsvps;
DROP POLICY IF EXISTS rsvp_insert_self   ON public.event_rsvps;
DROP POLICY IF EXISTS rsvp_update_self   ON public.event_rsvps;
DROP POLICY IF EXISTS rsvp_delete        ON public.event_rsvps;
DROP POLICY IF EXISTS invite_select_host ON public.event_invites;
DROP POLICY IF EXISTS invite_insert_host ON public.event_invites;
DROP POLICY IF EXISTS invite_delete_host ON public.event_invites;

-- RSVPs: visible to anyone (the going-list is public on the event page).
-- Guest phone numbers are sensitive — surfaced only to the host via a
-- separate query path on the server, never selected client-side.
CREATE POLICY rsvp_select ON public.event_rsvps
  FOR SELECT USING (true);

-- A signed-in user can RSVP themselves (insert/update own row).
CREATE POLICY rsvp_insert_self ON public.event_rsvps
  FOR INSERT WITH CHECK (
    (player_id IS NOT NULL AND auth.uid() = player_id)
  );

CREATE POLICY rsvp_update_self ON public.event_rsvps
  FOR UPDATE USING (
    auth.uid() = player_id
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.host_id = auth.uid())
  );

-- Hosts can delete RSVPs on their own event (e.g. remove a no-show).
-- Players can also delete their own RSVP.
CREATE POLICY rsvp_delete ON public.event_rsvps
  FOR DELETE USING (
    auth.uid() = player_id
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.host_id = auth.uid())
  );

-- Guest RSVP inserts (auth.uid() is null) are NOT allowed by RLS — they must
-- come through the server route that uses the service role and validates
-- invite_only / capacity / phone format.

-- Invites: only the host can read/write (phones are private).
CREATE POLICY invite_select_host ON public.event_invites
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.host_id = auth.uid())
  );

CREATE POLICY invite_insert_host ON public.event_invites
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.host_id = auth.uid())
  );

CREATE POLICY invite_delete_host ON public.event_invites
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.host_id = auth.uid())
  );
