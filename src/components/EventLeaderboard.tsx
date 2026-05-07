'use client';

import { useState } from 'react';
import LeaderboardList, { type LeaderboardMode } from './LeaderboardList';
import type { LeaderboardEntry } from '@/app/(app)/leaderboard/LeaderboardClient';
import type { SportKey } from '@/lib/caliber';

interface Props {
  sport: SportKey;
  /** Used for cricket / football. Empty for set sports. */
  main: LeaderboardEntry[];
  /** Used for badminton / table_tennis. */
  singles: LeaderboardEntry[];
  doubles: LeaderboardEntry[];
}

/**
 * Per-event leaderboard, rendered with the same medal / avatar / skill+points
 * row layout as the global `/leaderboard`. For set-based sports (badminton,
 * table_tennis) it surfaces a Singles/Doubles toggle that mirrors how the
 * global leaderboard splits badminton — same heuristic (one player per side
 * per match = singles, anything else = doubles).
 *
 * Default mode is "Skill" — caliber-based rank — but the host/player can
 * flip to "Career Points" for the per-event point haul (same definition
 * as global, applied to event matches only).
 */
export default function EventLeaderboard({ sport, main, singles, doubles }: Props) {
  const [mode, setMode] = useState<LeaderboardMode>('skill');
  const [setFormat, setSetFormat] = useState<'singles' | 'doubles'>('singles');

  const isSetSport = sport === 'badminton' || sport === 'table_tennis';

  const entries = !isSetSport
    ? main
    : (setFormat === 'singles' ? singles : doubles);

  return (
    <div className="flex flex-col gap-3">
      {/* Singles / Doubles toggle for set sports */}
      {isSetSport && (
        <div className="flex bg-gray-900/80 border border-gray-800 rounded-xl p-1 gap-1">
          {(['singles', 'doubles'] as const).map(sub => (
            <button
              key={sub}
              type="button"
              onClick={() => setSetFormat(sub)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                setFormat === sub
                  ? 'bg-emerald-900/40 text-emerald-200 border border-emerald-800/50'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {sub === 'singles' ? '🧍 Singles' : '👥 Doubles'}
              <span className="block text-[10px] font-normal text-gray-500 mt-0.5">
                ({sub === 'singles' ? singles.length : doubles.length} ranked)
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Skill / Career Points toggle */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-500">Rank by:</span>
        <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setMode('skill')}
            className={`px-3 py-1 rounded font-semibold transition-colors ${
              mode === 'skill' ? 'bg-emerald-700/50 text-emerald-200' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            🎯 Skill
          </button>
          <button
            type="button"
            onClick={() => setMode('points')}
            className={`px-3 py-1 rounded font-semibold transition-colors ${
              mode === 'points' ? 'bg-emerald-700/50 text-emerald-200' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            🏆 Career Points
          </button>
        </div>
      </div>

      <LeaderboardList
        entries={entries}
        mode={mode}
        sport={sport}
        emptyMessage={
          isSetSport
            ? `No ${setFormat} matches scored yet.`
            : 'No matches scored yet.'
        }
      />
    </div>
  );
}
