# GullySports

GullySports is a mobile-first scoring and player-profile app for gully cricket,
football, badminton, table tennis, foosball, and pickleball.

## Getting Started

Use Node.js 20 or newer, then run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.
The local `dev` script includes the machine CA/TLS workaround needed for
Supabase calls on this network. Production `build` and `start` do not disable
TLS verification.

## Admin Panel

Admin endpoint:

- Local: [http://localhost:3000/admin](http://localhost:3000/admin)
- Route: `/admin`
- Access: authenticated users with `profiles.is_admin = true`

Admin routes:

- `/admin` - operational overview with user, activity, match, event, pickup, queue, recent audit, and recent match metrics.
- `/admin/users` - latest active users with phone, last login, last seen, matches played/created, no-shows, and admin badge.
- `/admin/matches` - admin match queue for force-pushed and stuck-disputed matches, plus recent matches.
- `/admin/audit` - latest audit events with actor, entity, metadata, and timestamp.

Recent admin changes:

- Added shared admin shell/navigation and server-side `requireAdmin()` protection.
- Added overview, users, matches, and audit admin pages.
- Updated the main navbar admin link to point to `/admin` while keeping queue badges.
- Added approve/reject/admin-delete actions from the admin match queue.
- Added audit tracking for login success, match creation, participant confirmation/dispute, force-push, admin approve/reject, and admin delete.
- Added `profiles.last_seen_at`, `profiles.last_login_at`, `user_sessions`, and `audit_events` via `supabase/migrations/040_admin_dashboard_audit.sql`.

## School Sports

School sports is an internal workspace for a single school to run sports-day
events without touching the existing GullySports match leaderboard or caliber
board.

Routes:

- `/school` - school dashboard, student list, student entry, and meet list.
- `/school/setup` - one-time school and house setup.
- `/school/meets/new` - create a school meet with starter athletics events.
- `/school/meets/[id]` - meet overview, event list, medal count, and house points.
- `/school/meets/[id]/events/[eventId]` - register students and enter results.

Data model:

- Uses separate `school_*` tables.
- `school_students.profile_id` can optionally link a student to an existing
  GullySports profile.
- School results do not update `matches`, `player_match_stats`, global
  leaderboard, or caliber.

## Supabase

Apply pending migrations before testing admin dashboards that read audit/session
data:

```bash
supabase db push
```

The school sports feature requires `supabase/migrations/041_school_sports.sql`,
`042_fix_school_select_rls.sql`, `043_school_classes.sql`, and
`044_school_member_role_rls.sql`.
