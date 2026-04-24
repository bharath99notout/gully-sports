'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SportKey } from '@/lib/caliber';
import { getCaliberColor, getCaliberTierLabel } from '@/lib/caliber';

export interface LeaderboardEntry {
  player_id: string;
  name: string;
  avatar_url: string | null;
  score: number;       // caliber 0–100
  points: number;      // career total
  matches: number;
  wins: number;
  runs: number;
  wickets: number;
  goals: number;
}

const TABS: { key: SportKey; label: string; emoji: string }[] = [
  { key: 'cricket',      label: 'Cricket',   emoji: '🏏' },
  { key: 'football',     label: 'Football',  emoji: '⚽' },
  { key: 'badminton',    label: 'Badminton', emoji: '🏸' },
  { key: 'table_tennis', label: 'T. Tennis', emoji: '🏓' },
];

type Mode = 'skill' | 'points';

function medal(i: number) {
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return `#${i + 1}`;
}

function rowColor(i: number) {
  if (i === 0) return 'bg-yellow-950/30 border-yellow-800/50';
  if (i === 1) return 'bg-gray-800/40 border-gray-700/50';
  if (i === 2) return 'bg-amber-950/20 border-amber-900/40';
  return 'bg-gray-900/40 border-gray-800';
}

export default function LeaderboardClient({ cricket, football, badminton, table_tennis }: {
  cricket: LeaderboardEntry[];
  football: LeaderboardEntry[];
  badminton: LeaderboardEntry[];
  table_tennis: LeaderboardEntry[];
}) {
  const [active, setActive] = useState<SportKey>('cricket');
  const [mode, setMode] = useState<Mode>('skill');

  const base =
    active === 'cricket'      ? cricket :
    active === 'football'     ? football :
    active === 'badminton'    ? badminton :
    table_tennis;
  const entries = [...base].sort((a, b) =>
    mode === 'skill' ? b.score - a.score : b.points - a.points
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Sport tabs */}
      <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1">
        {TABS.map(t => {
          const count =
            t.key === 'cricket'      ? cricket.length :
            t.key === 'football'     ? football.length :
            t.key === 'badminton'    ? badminton.length :
            table_tennis.length;
          return (
            <button key={t.key} onClick={() => setActive(t.key)}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                active === t.key ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}>
              <span>{t.emoji} {t.label}</span>
              <span className="text-xs font-normal text-gray-500 ml-1">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Mode toggle — Skill vs Points */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-500">Rank by:</span>
        <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-0.5">
          <button onClick={() => setMode('skill')}
            className={`px-3 py-1 rounded font-semibold transition-colors ${
              mode === 'skill' ? 'bg-emerald-700/50 text-emerald-200' : 'text-gray-500 hover:text-gray-300'
            }`}>
            🎯 Skill
          </button>
          <button onClick={() => setMode('points')}
            className={`px-3 py-1 rounded font-semibold transition-colors ${
              mode === 'points' ? 'bg-emerald-700/50 text-emerald-200' : 'text-gray-500 hover:text-gray-300'
            }`}>
            🏆 Career Points
          </button>
        </div>
      </div>

      {/* Leaderboard */}
      {entries.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          <p className="text-3xl mb-2">{TABS.find(t => t.key === active)!.emoji}</p>
          <p className="text-sm text-gray-500">No players have played {active} yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((e, i) => {
            const { text: col } = getCaliberColor(e.score);
            const tierLabel = getCaliberTierLabel(e.score, [active]);
            return (
              <Link key={e.player_id} href={`/players/${e.player_id}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors hover:bg-gray-800/60 ${rowColor(i)}`}>
                <div className="w-8 text-center text-sm font-bold shrink-0">{medal(i)}</div>

                {e.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.avatar_url} alt={e.name}
                    className="w-10 h-10 rounded-full border-2 border-gray-800 object-cover shrink-0" />
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
      )}
    </div>
  );
}
