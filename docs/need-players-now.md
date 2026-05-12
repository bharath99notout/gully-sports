# Need Players Now — Setup & End-to-End Test Plan

This feature lets a host post a real-time pickup request and nearby opted-in
players join via dashboard rail + push notification.

Implemented in this branch:

- **MVP** — create pickup, browse nearby pickups, join, host approves/declines, WhatsApp handoff
- **V1** — Web Push notifications (host → joiner, joiner → host), preferences UI
- **V2** — mutual-match count on detail page, host attendance marking, reliability counter

## Files added / changed

| Layer | Files |
|---|---|
| DB migrations | `supabase/migrations/033_need_players_now.sql`, `034_push_subscriptions.sql`, `035_pickup_v2.sql` |
| Types | `src/types/index.ts` — `PickupRequest`, `PickupResponse`, `PickupRequestWithMeta` |
| Server lib | `src/lib/pickupsServer.ts`, `src/lib/push.ts` |
| Server actions | `src/app/actions/pickups.ts` |
| API routes | `/api/pickups/nearby`, `/api/push/subscribe`, `/api/push/unsubscribe` |
| UI pages | `/pickups`, `/pickups/new`, `/pickups/[id]` |
| Components | `NearbyPickupsRail`, `PickupActions`, `HostApprovalList`, `PickupSettings` |
| Hooks | `src/lib/useGeolocation.ts` |
| Service worker | `public/sw.js` — push event + click handler |

## One-time setup before testing

### 1. Apply migrations to Supabase

```sh
# Apply in order — each is idempotent.
psql $SUPABASE_DB_URL -f supabase/migrations/033_need_players_now.sql
psql $SUPABASE_DB_URL -f supabase/migrations/034_push_subscriptions.sql
psql $SUPABASE_DB_URL -f supabase/migrations/035_pickup_v2.sql
```

Or paste each file into the Supabase SQL editor.

### 2. Generate VAPID keys

```sh
npx web-push generate-vapid-keys
```

Add to `.env.local` and the same three to Vercel env vars:

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:bharathhandady@gmail.com
```

### 3. Run dev server

```sh
npm run dev
```

Open http://localhost:3000 in Chrome / Edge / Firefox.
Push notifications need HTTPS, but on `localhost` they work in HTTP too.

## E2E test plan

**Two browser sessions** required: one logged in as "Host", one as "Joiner". Use
two profiles or one normal + one incognito window.

### Phase 0: Preconditions

- [ ] Both users have profiles with `name` set.
- [ ] Joiner has `pickup_opt_in = true` and granted browser notification
      permission. (Test step 4 below sets this up.)

### Phase 1: MVP — create + browse + join + approve

1. **Host creates a pickup**
   - Host: open `/dashboard`
   - In the "Need Players Now" rail (top of dashboard), click "+ Post yours"
     (or open `/pickups/new` directly)
   - Allow location access when prompted
   - Pick sport = Cricket, slots = 2, ground = "Test Ground", start = Now,
     notes optional
   - Click "Send ping to nearby players"
   - **Expect:** redirected to `/pickups/<id>` showing the host view with
     "Waiting for joiners…"

2. **Joiner sees the rail**
   - Joiner: open `/dashboard` (allow location)
   - **Expect:** "Need Players Now" rail shows the host's card with sport,
     ground, distance (in km), slots-left, and "JOIN →"

3. **Joiner requests to join**
   - Joiner clicks the card → lands on `/pickups/<id>`
   - **Expect:** detail page shows host name, ground (with maps link),
     start time, "2 / 2 filled" no wait → "0 / 2 filled", and "I'm in" button
   - Click "I'm in"
   - **Expect:** button replaced with "Waiting for host to confirm…"

4. **Host approves**
   - Host: refresh `/pickups/<id>`
   - **Expect:** "Requesting to join (1)" section shows joiner with
     Accept / Decline buttons
   - Click Accept
   - **Expect:** joiner row moves to "Accepted (1)" with a WhatsApp link
     (joiner's phone)

5. **Joiner sees acceptance**
   - Joiner: refresh `/pickups/<id>`
   - **Expect:** "✓ You're in" banner + a WhatsApp link to host's phone

6. **Host cancels (cleanup)**
   - Host: click "Cancel pickup"
   - **Expect:** status changes to `cancelled`, both users see read-only state

### Phase 2: Slot capacity auto-fills

1. Host creates a pickup with `slots_total = 1`
2. Two joiners (use 2 incognito windows) both click "I'm in"
3. Host approves the first one
4. **Expect:** `pickup.status` flips to `filled`; second joiner's pending
   request remains but the host cannot approve them (no slots left)

### Phase 3: V1 — Web Push notifications

1. **Joiner opts in**
   - Joiner: open `/profile`
   - In "Pickup notifications" section, toggle "Enable"
   - **Expect:** browser asks for notification permission — click Allow
   - **Expect:** "Saved ✓" appears

2. **Host creates a pickup** (Phase 1 step 1)
   - **Expect:** within ~30s, Joiner's browser shows a notification:
     `🏏 <Host name> needs 2 players`
   - Click the notification → goes to `/pickups/<id>`

3. **Joiner requests to join**
   - **Expect:** Host's browser shows: `🙋 <Joiner name> wants to join`

4. **Host approves**
   - **Expect:** Joiner's browser shows: `✓ You're in!`

### Phase 4: V1 — Settings

1. Joiner: open `/profile` → Pickup notifications
2. Set sports to only `Cricket` (uncheck others)
3. Set radius to `3 km`
4. Set quiet hours to `22:00 – 07:00`
5. Save
6. Host creates a Football pickup → **Expect:** no push to joiner (sport filtered)
7. Host creates a Cricket pickup at midnight (use SQL to set
   `start_time` to a quiet-hour time) → **Expect:** no push (quiet hours)

### Phase 5: V2 — Mutual matches + attendance

1. Set up: ensure host and joiner have played a match together previously.
2. Joiner: open the pickup detail page
   - **Expect:** under host name, "· 1 mutual match"
3. After start time passes (or update `start_time` in SQL to be in the past),
   host: open detail page
   - **Expect:** Accepted joiner row now shows "✓ Came" and "No-show" buttons
4. Host clicks "No-show"
   - **Expect:** joiner row moves to "After match" section with "No-show" label
   - **Verify:** `select reliability_no_shows from profiles where id = <joiner_id>`
     incremented by 1.

### Phase 6: Anti-spam

1. Host creates 3 open pickups
2. Try creating a 4th
3. **Expect:** error "You can only have 3 open pickups at a time. Cancel one first."

### Phase 7: Auto-expire

1. Manually insert a pickup with `expires_at = now() - interval '1 hour'`
2. Open `/dashboard`
3. **Expect:** rail does NOT show the stale pickup
4. **Verify:** `select status from pickup_requests where id = <id>` is `expired`

## Known limitations (intentional, future work)

- **iOS push** only works in PWA-installed mode on iOS 16.4+. Document for users.
- **Caliber filter** (V2 setting `pickup_caliber_filter`) is stored but not
  yet applied to fan-out. The MVP / V1 push logic treats it as a no-op.
- **Reliability soft-cooldown** — `reliability_no_shows` is incremented but
  no UI consumes it yet (future: lower visibility for high-no-show users).
- **Server-side radius filter on push** — we filter recipients by sport + quiet
  hours + rate limit, but not by physical distance from the pickup ground
  (we'd need to store users' "home" lat/lng). The dashboard rail handles
  client-side distance filtering, so opted-in users near the ping see it
  in the rail even if they get a push from farther afield.

## Quick smoke check before pushing

```sh
npx tsc --noEmit -p .                      # must be clean
psql $SUPABASE_DB_URL < supabase/migrations/033_need_players_now.sql
psql $SUPABASE_DB_URL < supabase/migrations/034_push_subscriptions.sql
psql $SUPABASE_DB_URL < supabase/migrations/035_pickup_v2.sql
npx web-push generate-vapid-keys           # paste into .env.local + Vercel
npm run dev
```

Then walk through Phases 1, 3, 5 in two browser windows.
