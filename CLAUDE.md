@AGENTS.md

# GullySports — Claude Context

## What This Project Is
GullySports is a mobile-first gully cricket/football/badminton scoring and player profile app built for Indian amateur sports communities. Players log matches, track personal stats, and earn caliber ratings. Built with Next.js 15 App Router + Supabase.

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
Phone number login, **no SMS provider**:
- Phone `9876543210` → stored as email `9876543210@live.com`, password = last 6 digits (`543210`)
- OTP = last 4 digits of phone, validated **client-side only** (`otp === phone.slice(-4)`)
- No email or SMS is ever sent to the user
- `profiles.phone` stores the raw phone number (backfilled via migration 007)

**Auth flows:**
- Returning user with name → `/dashboard`
- User with no name → `/auth/signup` (name-only step, skips phone/OTP)
- New user → `/auth/signup` (full flow)
- Always use `window.location.href` for post-auth redirects (not `router.push`) — needed so auth cookie is written before navigation

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
| 50–69 | Pro | Rohit Sharma Mode 🏏 | Chhetri Mode 🇮🇳 | Saina Nehwal Mode ⭐ |
| 70–84 | Expert | Chris Gayle Mode 🔥 | Neymar Mode 🎭 | PV Sindhu Mode 🏆 |
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
