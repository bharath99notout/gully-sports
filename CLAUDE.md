@AGENTS.md

# GullySports — Claude Context

## What This Project Is
GullySports is a mobile-first gully cricket/football/badminton scoring and player profile app built for Indian amateur sports communities. Players log matches, track personal stats, and earn caliber ratings. Built with Next.js 15 App Router + Supabase.

---

## Decision Lens — Always evaluate changes through 3 perspectives

**Every code change, product decision, copy change, template, error message, or config tweak in this project must be assessed through all three lenses below — not just the developer one. If any lens fails the change, redesign before shipping.**

### 1. Product
- Does this serve our actual audience (Indian amateur sports players, often rural / first-time app users)?
- Does it leak internal implementation details (DB columns, synthetic emails, system flags) into anything user-facing?
- Does it create the right first impression? (Onboarding, first email, first OTP — these are the moments where users decide whether to trust us.)
- Is the cheapest viable solution chosen, or are we over-engineering for a non-existent scale problem?
- Will this still feel right at 10x the user count, or are we baking in a problem?

### 2. Developer
- Is the data model honest, or is there a hack (`@live.com` email-as-phone, fake password = last 6 digits, etc.) that future-you will trip over? If a hack exists, is it documented here in CLAUDE.md?
- Are auth/security boundaries enforced server-side (admin client, route handlers), not just hidden in the UI?
- Is the change reversible? Migrations idempotent? Feature flags where ambiguous?
- Type-checks pass, no `any` smuggling, RLS still applies.

### 3. End User (rural / amateur cricket player on a mid-range Android)
- Can the user understand the screen / email in 4 seconds, in English-as-second-language?
- Does the copy reference things they recognize (their phone, "GullySports", a code), not internal artefacts (`6366007222@live.com`, `email_otp_enabled`, `auth.users`)?
- Is the action they need to take obvious — one big button, code visible, no jargon?
- If the network is slow, will it still feel responsive (loading states, optimistic UI where safe)?
- If something fails, is the error message human ("Try again in 19 seconds") not technical ("rate_limit_exceeded")?

### Worked example — Email-OTP verification template (Apr 2026)

**The bug:** The first version of the email-change template said *"You're changing your GullySports email from `{{ .Email }}` to `{{ .NewEmail }}`."* That works fine for a power user changing their email — but for a **brand-new signup** whose `auth.users.email` is the synthetic `<phone>@live.com` from the legacy auth hack, the template renders as *"changing from `6366007222@live.com` to `bharath@gmail.com`"*. End user reaction: "I never created `6366007222@live.com` — is this phishing?" → email deleted, support ticket, lost trust.

| Lens | What it caught |
|---|---|
| Product | Internal hack (`@live.com` synthetic emails) leaked into user-facing copy. First impression of email-OTP was suspicious. |
| Developer | Supabase template variable `{{ .Email }}` is unconditional — there's no clean way to hide it for synthetic-email cases. The fix is to *not reference it at all*. |
| End User | "What's `6366007222@live.com`?" — confusing because the user never typed that address. |

**The fix:** drop `{{ .Email }}` from the template entirely. Just confirm the new email. Same template works for first-add and change cases. Works because losing "from old to new" framing is a small loss, but gaining "this email looks real and trustworthy" is a big win.

**Lesson:** any time a UI / email / copy references a value the user did not enter themselves, run it through all three lenses before shipping.

---

## End-to-end thinking — every feature touches 4+ surfaces

Before claiming a feature done, walk it through every surface it shows up on. A change that "works" in isolation but silently breaks an aggregation page is worse than a clean failure — the user thinks the system is healthy and bad data accumulates.

**Always trace a feature through this checklist before reporting done:**

1. **Write path** — match-creation insert, score update, roster add. Does the column actually exist on the table? `match_players` has no `name` column; including it 400s the entire INSERT silently and leaves the roster empty.
2. **Direct read path** — the page that lists the entity (e.g. `/matches/[id]`). Same column-existence check on every embedded resource.
3. **Aggregation read paths** — anywhere the entity rolls up. For matches: `/tournaments/[id]` (matches tab, standings, leaderboards, awards), `/dashboard`, `/leaderboard`, `/players/[id]`. **One failed embed at the SELECT level returns null for the whole row, not just the embed** — every downstream tab goes empty.
4. **Status / state filters** — does the aggregator respect `status`, `confirmation_state`, `tournament_id`? Standings counts `status = 'completed'`; leaderboards count `player_match_stats` rows. A match in `live` with no stats is fine; a match in `completed` with broken player_match_stats fetch is invisible.

**Checklist for any new column or query change:**
- [ ] Column exists in the migration that the env actually has applied (`ls supabase/migrations/`).
- [ ] Every `.select('… nested(…)')` lists only real columns. Verify by `curl` against the REST endpoint with the anon key — PostgREST returns `42703` for missing columns.
- [ ] Every aggregator route (`/tournaments/*`, `/dashboard`, `/leaderboard`) renders without empty-state regressions on a match that should be there.
- [ ] If the change writes data, `/matches/[id]` and the tournament Matches tab both show it.

**Lesson — `match_players.name` (May 2026):** A roster-seed change inserted `{ player_id, team_name, name }` and the tournament page selected `match_players(player_id, team_name, name)`. The column never existed. INSERT 400'd silently → no roster on tournament matches; SELECT 42703'd → entire `matches` query returned null → tournament Matches/Standings/Leaderboard tabs all showed empty. None of this surfaced on `/matches/[id]` because that page joined names via `profiles(name)` instead. Cost: every feature touching tournament matches looked broken end-to-end. Always grep all references before adding/renaming a column-shaped field.

---

## Reuse rule — never re-implement existing flows

**Before adding a "search-and-pick" / "create entity" / "OTP entry" / similar UI anywhere new, check if a shared component already exists. If yes — reuse it. If no — extract the second instance into a shared component on the spot.**

Repeated UI fragments diverge over time: one search picks up phone-search, another stays name-only; one shows phone uniqueness errors, another swallows them. End users hit subtly different versions of "the same thing" and the developer ships the same bug three times. Single source of truth.

### Shared component registry

| Component | Location | Use whenever you need to… |
|---|---|---|
| **`PlayerSearchAndAdd`** | [src/components/PlayerSearchAndAdd.tsx](src/components/PlayerSearchAndAdd.tsx) | Find an existing player by name **or** mobile, or create a new placeholder player (phone deduped via `/api/auth/create-placeholder-player`). Parent passes an `onAdd(playerId, displayName)` callback that handles the actual association (insert into `team_members`, `tournament_team_players`, `match_players`, etc). Used in: team detail page, tournament team rosters. **Match scorers should migrate to this next.** |
| **`GoogleSignInButton`** *(removed)* | — | Reserved spot — re-add only when you ship Google OAuth. |

### Endpoints that match this rule

| Endpoint | Purpose | Reuse instead of writing parallel SQL on the client |
|---|---|---|
| **`/api/auth/create-placeholder-player`** | Find-or-create a phone-only auth user. **Phone is the dedup key — never returns a duplicate.** Returns `{ id, name, created: true | false }`. Caller is responsible for any team/tournament association after. | Used by `PlayerSearchAndAdd`. Don't write `auth.signUp({email: <phone>@live.com})` in new code — it bypasses the dedup. |
| **`/api/auth/last4-signin`** / **`/api/auth/last4-signup`** | Last-4-digits OTP issuance. Returns a magic-link `token_hash` that the browser finalises with `verifyOtp`. | Anywhere you need silent sign-in/up by phone. Don't call `signInWithPassword` directly — the legacy email-as-phone hack only works for users who have a password set. |
| **`/api/auth/check-email-otp`** | Returns `{ exists, email_otp_enabled, email_hint }` for a 10-digit phone. | Login flow / any place that needs to branch on whether a user opted into email OTP. |

### When to extract instead of copy-paste

- **First instance:** write inline. Don't preemptively extract — speculative components are usually wrong.
- **Second instance** *or* **first time the inline copy will be visible to end users in two places:** stop, extract to `src/components/`, replace both with the shared component in the same change. Update this CLAUDE.md table.
- **Never** ship "almost the same thing" twice. End users notice. Developers forget which copy to update.

---

## Offline scoring — write-ahead queue (May 2026)

Scoring works without internet. Every mutation in `Cricket/Badminton/Football/TableTennis` scorers goes through **`offlineMutate()`** at [src/lib/offline/mutate.ts](src/lib/offline/mutate.ts) — never raw `supabase.from(...).update/insert/upsert/delete(...)`.

**How it works:**
- Online → run directly. On success, return.
- Offline (or network error mid-flight) → serialize the op into IndexedDB (`gullysports_offline.pending_ops`), return optimistic success. UI banner shows pending count.
- `online` event / 30s reconciliation tick / app load → `drainQueue()` runs FIFO with auth-session refresh, idempotency guards (409 / SQLSTATE 23505 on insert retry treated as success), backoff on transient errors, and terminal-failure surfacing in the banner.

**Rules for anyone adding new scorer mutations:**
- Always use `offlineMutate(supabase, { kind, table, values, where|onConflict }, matchId)` — never bypass it. Bypassing means the action drops silently when offline.
- For `insert` ops on tables with a `unique` constraint (e.g. `match_players(match_id, player_id)`), generate the row `id` client-side with `crypto.randomUUID()` so the optimistic UI knows the row's primary key without round-tripping. Idempotent retries are handled by the drainer's 409 detection.
- All updates send the **absolute** value (e.g. `runs: newRuns`) not a delta. The drainer replays ops in order; the last value for a given (table, key) wins. Don't introduce server-side `+=` updates — they'll double-apply on retry.
- Mutations that *must* succeed before continuing (e.g. createPlaceholderPlayer via `/api/auth/create-placeholder-player`) bypass the queue intentionally — they require the server. Keep them rare and short-circuit them with a clear "needs internet" message if offline.
- Reads (SELECTs) are **not** queued. They fail loudly when offline. Player search, profile lookup, etc. are skipped/stubbed when `navigator.onLine === false`.

**Known limitations (call these out if relevant to a feature):**
- Reload-while-offline: cached React state is lost; server still has the last-synced value, queue still has the pending ops, so on next render+drain the data lands. The user shouldn't actively reload offline — `beforeunload` shows a warning.
- Multi-device offline scoring of the same match: last-writer-wins. We don't merge.
- Match creation requires internet (the page that creates the match does several reads). Once a match exists, all subsequent scoring works offline.
- Triggers (confirmation rows, notifications) only fire when the `matches.status='completed'` write reaches the server — i.e. when the queue drains. Notifications won't go out until reconnect.

---

## Tournaments — Open Registration Model

Trust-based, no approval gate. Two parallel paths achieve the same outcome:

| Path | Actor | UI |
|---|---|---|
| Tournament organizer adds a team | The user who created the tournament | Tournament page → Overview → "+ Add team" — picker shows **every** team in the matching sport (not just organizer's own); search-as-you-type; captain's name shown for disambiguation |
| Team captain joins a tournament | The user who created the team | Team page → "Tournaments" section — shows non-completed tournaments in the team's sport; one-tap "Join" button |

**RLS that makes both work** (migration 022): `tournament_teams.INSERT` and `tournament_team_players.INSERT` allow either:
```
tournament.created_by = auth.uid()  OR  team.created_by = auth.uid()
```

**Removal mirrors insertion:** organizer can kick a team; team captain can withdraw their own team. Both remove from `tournament_teams` AND `tournament_team_players` for that team in that tournament.

**No approval workflow yet.** Spam is a theoretical risk only. Add `tournament.registration_mode = 'open_with_approval'` + a `tournament_join_requests` table only when a real user complains about it.

---

## Tech Stack
- **Framework**: Next.js 15 App Router (`src/app/`)
- **Styling**: Tailwind CSS v4 — uses `@import "tailwindcss"` in `globals.css`, NO `tailwind.config.js`
- **Database + Auth**: Supabase (PostgreSQL + RLS + Storage)
- **Language**: TypeScript
- **Deployment**: Vercel
- **Icons**: `lucide-react`
- **Confetti**: `canvas-confetti`

---

## Auth Mechanism (Non-standard — read carefully)

Two-tier system: **default zero-friction last-4 OTP for everyone**, **opt-in email OTP for users who want stronger sign-in**.

### Tier 1 — Default: last-4-digits OTP (no SMS, no email, no cost)
- Phone `9876543210` → stored as `auth.users.email = '9876543210@live.com'` + `auth.users.phone = '+919876543210'`
- The "OTP" the user types is the **last 4 digits of their own phone** (`9876543210` → OTP is `3210`)
- **No SMS or email is sent** — there is no provider integration on this path
- The login UI shows the hint *"Your OTP is the last 4 digits of your mobile number"* so users know what to type
- Server validates `otp === phone.slice(-4)` and issues a magic-link `token_hash` via `admin.auth.admin.generateLink({type:'magiclink', email})` — browser finalises with `verifyOtp({token_hash, type:'magiclink'})`
- Endpoints: [`/api/auth/last4-signin`](src/app/api/auth/last4-signin/route.ts), [`/api/auth/last4-signup`](src/app/api/auth/last4-signup/route.ts)

### Tier 2 — Opt-in: email OTP (free, stronger)
- A user can add a real email at signup (optional Email field on the name step) **or** later from the `/profile` page
- Adding an email triggers `supabase.auth.updateUser({email})` (browser-side) → Supabase sends a 6-digit code to the new email via the **Change email address** template
- User enters code → `verifyOtp({email, token, type: 'email_change'})` finalises the email change
- App calls [`/api/auth/enable-email-otp`](src/app/api/auth/enable-email-otp/route.ts) → flips `profiles.email_otp_enabled = true`
- From this point, **last-4 OTP is REJECTED** for that user. They must use email OTP every time.
- Sign-in for email-OTP users: phone-entry → `/api/auth/check-email-otp` → if flag is set → `/api/auth/send-email-otp` triggers `signInWithOtp({email})` → user types code from email → `verifyOtp({email, token, type: 'email'})`

### Critical: Supabase email templates need `{{ .Token }}`
Supabase's default Change-email and Magic-link templates only contain a magic link, not the 6-digit code. **Templates have been customized** in Supabase Dashboard → Authentication → Email Templates to use `{{ .Token }}` instead. If you're cloning to a new Supabase project, you must redo this — see the worked example in the Decision Lens section above for the correct template body. **Do NOT reference `{{ .Email }}` in the template** (it leaks the synthetic `@live.com` address).

### Why we don't use Twilio / MSG91 / WhatsApp / DLT
- DLT registration in India costs ~₹6,000 + ongoing per-template fees → not worth it for an amateur-cricket-app at current scale
- Twilio: same DLT requirement now + 20–30× cost
- WhatsApp Cloud API: free for OTPs but Meta WABA setup + business verification is multi-day and many small users don't have Facebook Business
- The last-4 hack is "secure enough" because the worst-case impact of impersonation is someone scoring a fake match in your name. No payment, no PII. Email OTP is available for users who want stronger.

### Legacy artefacts (still in code, expected to stay)
- `MAGIC_SMS_OTP = '7222'` in [src/lib/phoneAuth.ts](src/lib/phoneAuth.ts) — historical dev bypass, only active when `ENABLE_MAGIC_PHONE_OTP=true` in env. Not used by the new flow.
- [`/api/auth/magic-phone-otp`](src/app/api/auth/magic-phone-otp/route.ts) — still here for the magic 7222 code path. New flows use last4-signin / last4-signup instead.
- `findAuthUserIdByPhone10` helper has fallback for `<digits>@live.com` legacy email lookup — required because users created before migration 016 had `auth.users.phone = NULL`.

### Key rules
- Always use `window.location.href` for post-auth redirects (not `router.push`) — auth cookie needs full-page reload to be written before navigation
- Returning user with name → `/dashboard`
- User with no name (incl. signup not-yet-named) → `/auth/signup`
- Profile name updates use `UPDATE` not `upsert` — INSERT is blocked by RLS

---

## Database Schema (Key Tables)

### `profiles`
`id, name, avatar_url, phone, created_at`

### `matches`
`id, sport, status (upcoming|live|completed), team_a_name, team_b_name, team_a_id?, team_b_id?, winner_team_id?, winner_team_name, created_by, played_at, cricket_overs, batting_team_name, striker_id, non_striker_id, bowler_id, current_innings`

> `winner_team_name` (TEXT) is the reliable winner field — `winner_team_id` is null for ad-hoc matches with no registered teams.

### `match_scores`
`id, match_id, team_name, runs, wickets, overs_faced, goals, sets`

### `match_players`
`id, match_id, player_id, team_name, name`

### `player_match_stats`
`id, match_id, player_id, sport, runs_scored, wickets_taken, catches_taken, goals_scored`

### `teams`
`id, name, sport, created_by`

---

## File Structure

```
src/
├── app/
│   ├── (app)/               # Authenticated routes (layout has Navbar)
│   │   ├── dashboard/       # Player profile + recent matches + trophy banners
│   │   ├── matches/         # Match list (only user's matches)
│   │   │   └── [id]/        # Match detail + CricketScorer
│   │   ├── players/         # Player search + profiles
│   │   ├── profile/         # Edit own profile
│   │   └── teams/           # Team management
│   ├── auth/
│   │   ├── login/           # Phone + OTP login
│   │   └── signup/          # Name setup for new users
│   └── globals.css          # Tailwind v4 import + trophy animation keyframes
├── components/
│   ├── AthleteCard.tsx      # Player profile card (sport caliber bars, tier names)
│   ├── CaliberBar.tsx       # Animated progress bar for sport score
│   ├── TrophyBanner.tsx     # Achievement pop-up with confetti (client component)
│   ├── FeedMatchCard.tsx    # Match summary card in feed
│   ├── Navbar.tsx
│   └── ui/                  # Card, Button primitives
├── lib/
│   ├── caliber.ts           # Score formulas, tier names, sport-specific labels
│   ├── athleteData.ts       # Aggregates DB stats → AthleteData shape
│   └── supabase/            # client.ts + server.ts Supabase clients
└── types/index.ts           # Match, MatchScore, MatchPlayer, CricketPlayerStat, etc.
```

---

## Caliber Score System (`src/lib/caliber.ts`)

Score 0–100 per sport, averaged for overall.

| Score | Generic Label | Cricket | Football | Badminton |
|-------|--------------|---------|----------|-----------|
| 0 | Bench Warmer | Bench Warmer 🪑 | Bench Warmer 🪑 | Bench Warmer 🪑 |
| 1–24 | Rookie | Gully Star 🌟 | Gully Striker ⚽ | Shuttle Rookie 🏸 |
| 25–49 | Amateur | Hard Hitter 💪 | Street Footballer 💨 | Net Rusher 💨 |
| 50–69 | Pro | Rohit Sharma Mode 🏏 | Chhetri Mode 🇮🇳 | Padukone Mode ⭐ |
| 70–84 | Expert | Chris Gayle Mode 🔥 | Neymar Mode 🎭 | Srikanth Mode 🏆 |
| 85–94 | Champion | Virat Kohli Mode 👑 | Messi Mode 🐐 | Lee Chong Wei Mode 🌟 |
| 95–100 | Legend | Sachin Level 🏆 | Ronaldo Level 🔥 | Lin Dan Level 👑 |

**Formulas:**
- Cricket: `perf = (min(avg,60)/60)*0.45 + (min(wpm,3)/3)*0.35 + winRate*0.20`, `score = round((exp*0.20 + perf*0.80)*100)`, `exp = min(1, matches/8)`
- Football: `perf = (min(gpm,2)/2)*0.60 + winRate*0.40`
- Badminton: win-rate only

---

## Cricket Scorer (`src/app/(app)/matches/[id]/CricketScorer.tsx`)

Key state: `battingTeam`, `strikerId`, `nonStrikerId`, `bowlerId`, `innings (1|2)`, `winnerSide ('a'|'b'|null)`

**Important cricket logic:**
- Overs format: `1.3` = 1 over + 3 balls = 9 total balls. Use `oversTooBalls()` / `ballsToOvers()` helpers
- `canScore` = striker + non-striker + bowler all selected (blocks scoring otherwise)
- Chase complete: 2nd innings, batting team runs > opponent's runs → auto-win
- All-out: `wickets >= battingPlayers.length - 1` → end innings or end match
- Bowler auto-resets every 6 balls (end of over)
- Custom `PlayerSelect` / `PlayerDropdown` components (not native `<select>` — broken on iOS Safari dark mode)
- `winnerSide: 'a' | 'b' | null` used instead of team UUIDs to avoid `undefined === undefined` bug on ad-hoc matches

**Post-match shows:**
1. MVPLeaderboard (impact = runs + 20×wickets + 10×catches)
2. PostMatchSummary (result banner + batting scorecard + bowling figures per team + highlights)

---

## Trophy Banner (`src/components/TrophyBanner.tsx`)

- Client component — takes `achievements: Achievement[]` from dashboard server component
- Shows achievements **one at a time**, sequentially
- Each shows for **7.5 seconds** then auto-dismisses
- Fires `canvas-confetti` on each achievement (side cannons for gold tier)
- Tracks view count in `localStorage` key `gs_ach` (`{ [id]: count }`) — shows up to **3 times**
- Achievement types: Century (100r), Half-Century (50r), 5-Wicket Haul, Hat-Trick Hero (3w), Bowling Legend (10w), Catch Master (3c), Goal Fest (5 goals), Match MVP

---

## CSS Animations (`src/app/globals.css`)

Custom keyframes (used by TrophyBanner):
- `trophy-enter` — slides in from top with spring bounce
- `trophy-exit` — slides up and fades out
- `trophy-bar` — depleting timer bar (scaleX 1→0)
- `trophy-wiggle` — emoji wiggle on entry

---

## Supabase Migrations (run in order in SQL Editor)

| File | What it does |
|------|-------------|
| `001_initial_schema.sql` | Core tables |
| `002_fix_trigger.sql` | Fix new user trigger |
| `003_cricket_player_scoring.sql` | player_match_stats table |
| `004_phone_auth.sql` | Phone-as-email auth setup |
| `005_fix_profile_name_trigger.sql` | Clears numeric names from old accounts |
| `006_innings_tracking.sql` | Adds `current_innings` to matches |
| `007_backfill_phone.sql` | Backfills `profiles.phone` from auth.users.email |
| `008_winner_team_name.sql` | Adds `winner_team_name TEXT` to matches |

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=https://pkpuaznejjlyelgjzbst.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_C-1TVbEWXO7OTVf6sXjQEA_iKsU-MUx
```

Must be set in Vercel dashboard under Settings → Environment Variables.

---

## Dev Server

```bash
PATH="/Users/bharath8.kumar/.nvm/versions/node/v20.20.0/bin:$PATH" npm run dev -- --port 3001
```

Runs at: http://localhost:3001

---

## Key Conventions

- **Server components** for data fetching (dashboard, matches list, match detail page)
- **Client components** for interactivity (`'use client'` — CricketScorer, TrophyBanner, AvatarUpload, CaliberBar, dropdowns)
- **No `router.push` after auth** — always `window.location.href` for full page reload
- **No native `<select>`** — use custom button-based dropdowns (iOS Safari dark mode renders them invisibly)
- **Profile name updates** use `UPDATE` not `upsert` — INSERT is blocked by RLS
- **Player search** runs two parallel `.ilike()` queries (name + phone) and deduplicates — avoids `.or()` encoding issues
- **Ad-hoc matches** have no `team_a_id`/`team_b_id` — never compare `winner_team_id === team_a_id` directly; use `winner_team_name` instead
