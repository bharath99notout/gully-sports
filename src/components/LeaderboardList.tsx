'use client';

import Link from 'next/link';
import { getCaliberColor, getCaliberTierLabel, type SportKey } from '@/lib/caliber';
import type { LeaderboardEntry } from '@/app/(app)/leaderboard/LeaderboardClient';

/**
 * Rank modes — what to sort by and what to display as the headline number
 * on each row.
 *
 *   skill / points     — universal, work for any sport.
 *   runs / wickets /
 *   catches            — cricket-specific disciplines.
 *   goals / wins       — football-specific disciplines (wins also valid
 *                        for any sport, but right now only football
 *                        surfaces it as a discrete rank-mode).
 */
export type LeaderboardMode = 'skill' | 'points' | 'runs' | 'wickets' | 'catches' | 'goals' | 'wins';

function medal(i: number): string {
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return `#${i + 1}`;
}

function rowColor(i: number): string {
  if (i === 0) return 'bg-yellow-950/30 border-yellow-800/50';
  if (i === 1) return 'bg-gray-800/40 border-gray-700/50';
  if (i === 2) return 'bg-amber-950/20 border-amber-900/40';
  return 'bg-gray-900/40 border-gray-800';
}

function sortValue(e: LeaderboardEntry, mode: LeaderboardMode): number {
  switch (mode) {
    case 'skill':   return e.score;
    case 'points':  return e.points;
    case 'runs':    return e.runs;
    case 'wickets': return e.wickets;
    case 'catches': return e.catches;
    case 'goals':   return e.goals;
    case 'wins':    return e.wins;
  }
}

interface Headline { primary: string; primaryClass: string; secondary: string; secondaryClass: string }

function headline(e: LeaderboardEntry, mode: LeaderboardMode, caliberClass: string): Headline {
  // Only Skill mode keeps caliber as the headline; every other mode uses
  // the discipline stat as the primary number and surfaces caliber as the
  // small secondary line so users still see the player's overall tier.
  switch (mode) {
    case 'skill':
      return {
        primary: String(e.score), primaryClass: caliberClass,
        secondary: `${e.points.toLocaleString()} pts`, secondaryClass: 'text-gray-500',
      };
    case 'points':
      return {
        primary: e.points.toLocaleString(), primaryClass: 'text-white',
        secondary: `Skill ${e.score}`, secondaryClass: caliberClass,
      };
    case 'runs':
      return {
        primary: String(e.runs), primaryClass: 'text-emerald-400',
        secondary: `runs · ${e.matches} match${e.matches === 1 ? '' : 'es'}`,
        secondaryClass: 'text-gray-500',
      };
    case 'wickets':
      return {
        primary: String(e.wickets), primaryClass: 'text-orange-400',
        secondary: `wkts · ${e.matches} match${e.matches === 1 ? '' : 'es'}`,
        secondaryClass: 'text-gray-500',
      };
    case 'catches':
      return {
        primary: String(e.catches), primaryClass: 'text-cyan-400',
        secondary: `catches · ${e.matches} match${e.matches === 1 ? '' : 'es'}`,
        secondaryClass: 'text-gray-500',
      };
    case 'goals':
      return {
        primary: String(e.goals), primaryClass: 'text-emerald-400',
        secondary: `goals · ${e.matches} match${e.matches === 1 ? '' : 'es'}`,
        secondaryClass: 'text-gray-500',
      };
    case 'wins':
      return {
        primary: String(e.wins), primaryClass: 'text-emerald-400',
        secondary: `wins · ${e.matches} match${e.matches === 1 ? '' : 'es'}`,
        secondaryClass: 'text-gray-500',
      };
  }
}

/**
 * Pure leaderboard row list — medal, avatar, caliber tier label, headline
 * number. Shared by the global `/leaderboard` page and the per-event
 * leaderboard so both render identically: same medals, same avatar style,
 * same caliber-coloured tier label.
 *
 * The caller decides:
 *   - `entries` — pre-built; this component sorts by `mode`
 *   - `mode`   — universal (skill / points) or sport-specific
 *                (runs / wickets / catches / goals / wins)
 *   - `sport`  — used for the caliber tier label; pass 'all' for
 *                cross-sport view
 */
export default function LeaderboardList({
  entries, mode, sport, emptyMessage,
}: {
  entries: LeaderboardEntry[];
  mode: LeaderboardMode;
  sport: SportKey | 'all';
  emptyMessage?: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-sm text-gray-500 text-center">
        {emptyMessage ?? 'No players yet.'}
      </p>
    );
  }

  // Pull only the players who have a non-zero value for the chosen rank
  // metric — a "Top Wicket Takers" list cluttered with 0-wicket batters
  // hides the actual signal. Skill/Points modes are kept inclusive since
  // 0 there means "unrated", which is itself a valid display.
  const filtered = (mode === 'skill' || mode === 'points')
    ? entries
    : entries.filter(e => sortValue(e, mode) > 0);

  const sorted = [...filtered].sort((a, b) => sortValue(b, mode) - sortValue(a, mode));

  if (sorted.length === 0) {
    return (
      <p className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-sm text-gray-500 text-center">
        {emptyMessage ?? 'No data for this rank yet.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((e, i) => {
        const { text: caliberClass } = getCaliberColor(e.score);
        const tierLabel = sport === 'all'
          ? (e.sports_played
              ? `${e.sports_played} sport${e.sports_played > 1 ? 's' : ''} · ${e.wins}/${e.matches} wins`
              : 'No matches yet')
          : getCaliberTierLabel(e.score, [sport]);
        const h = headline(e, mode, caliberClass);
        return (
          <Link
            key={e.player_id}
            href={`/players/${e.player_id}`}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors hover:bg-gray-800/60 ${rowColor(i)}`}
          >
            <div className="w-8 text-center text-sm font-bold shrink-0">{medal(i)}</div>

            {e.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={e.avatar_url}
                alt={e.name}
                className="w-10 h-10 rounded-full border-2 border-gray-800 object-cover shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-sm font-bold text-white border-2 border-gray-800 shrink-0">
                {e.name[0]?.toUpperCase() ?? '?'}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{e.name}</p>
              <p className={`text-xs truncate ${caliberClass}`}>{tierLabel}</p>
            </div>

            <div className="text-right shrink-0">
              <p className={`text-xl font-black tabular-nums leading-none ${h.primaryClass}`}>{h.primary}</p>
              <p className={`text-[10px] mt-1 tabular-nums ${h.secondaryClass}`}>{h.secondary}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
