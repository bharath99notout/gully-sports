'use client';

import Link from 'next/link';
import { getCaliberColor, getCaliberTierLabel, type SportKey } from '@/lib/caliber';
import type { LeaderboardEntry } from '@/app/(app)/leaderboard/LeaderboardClient';

export type LeaderboardMode = 'skill' | 'points';

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

/**
 * Pure leaderboard row list — medal, avatar, caliber tier, headline number.
 * Shared by the global `/leaderboard` page and the per-event leaderboard
 * so both render identically: same medals, same avatar style, same
 * caliber-coloured tier label, same skill-vs-points secondary line.
 *
 * The caller decides:
 *   - `entries` — pre-sorted or unsorted; this component sorts by `mode`
 *   - `mode`   — 'skill' (rank by caliber) or 'points' (career points)
 *   - `sport`  — used for tier labelling; pass 'all' for cross-sport view
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

  const sorted = [...entries].sort((a, b) =>
    mode === 'skill' ? b.score - a.score : b.points - a.points
  );

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((e, i) => {
        const { text: col } = getCaliberColor(e.score);
        const tierLabel = sport === 'all'
          ? (e.sports_played
              ? `${e.sports_played} sport${e.sports_played > 1 ? 's' : ''} · ${e.wins}/${e.matches} wins`
              : 'No matches yet')
          : getCaliberTierLabel(e.score, [sport]);
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
              <p className={`text-xs truncate ${col}`}>{tierLabel}</p>
            </div>

            <div className="text-right shrink-0">
              {mode === 'skill' ? (
                <>
                  <p className={`text-xl font-black tabular-nums leading-none ${col}`}>{e.score}</p>
                  <p className="text-[10px] text-gray-500 mt-1 tabular-nums">
                    {e.points.toLocaleString()} pts
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xl font-black tabular-nums leading-none text-white">
                    {e.points.toLocaleString()}
                  </p>
                  <p className={`text-[10px] mt-1 tabular-nums ${col}`}>
                    Skill {e.score}
                  </p>
                </>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
