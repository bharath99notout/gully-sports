'use client';

import { useState } from 'react';
import { SportKey } from '@/lib/caliber';
import LeaderboardList, { type LeaderboardMode } from '@/components/LeaderboardList';
import SportIcon from '@/components/SportIcon';

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
  catches: number;     // cricket: used by the Fielding rank-mode
  goals: number;
  sports_played?: number; // only used in the "All" tab
}

type TabKey = SportKey | 'all';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',          label: 'All' },
  { key: 'cricket',      label: 'Cricket' },
  { key: 'football',     label: 'Football' },
  { key: 'badminton',    label: 'Badminton' },
  { key: 'table_tennis', label: 'T. Tennis' },
  { key: 'foosball',     label: 'Foosball' },
];

type SetFormat = 'singles' | 'doubles';

/** Per-sport rank options. Universal (skill/points) come first, then
 *  the sport's discipline ranks. Badminton/TT keep just the universal
 *  pair — they get a Singles/Doubles toggle as a separate axis. */
function modesForSport(tab: TabKey): { value: LeaderboardMode; label: string }[] {
  switch (tab) {
    case 'cricket':
      return [
        { value: 'skill',   label: '🎯 Skill' },
        { value: 'points',  label: '🏆 Points' },
        { value: 'runs',    label: '🏏 Top Run Scorer' },
        { value: 'wickets', label: '🎳 Top Wicket Taker' },
        { value: 'catches', label: '🧤 Most Catches' },
      ];
    case 'football':
      return [
        { value: 'skill',  label: '🎯 Skill' },
        { value: 'points', label: '🏆 Points' },
        { value: 'goals',  label: '⚽ Top Scorer' },
        { value: 'wins',   label: '🥇 Most Wins' },
      ];
    case 'badminton':
    case 'table_tennis':
    case 'foosball':
    case 'all':
    default:
      return [
        { value: 'skill',  label: '🎯 Skill' },
        { value: 'points', label: '🏆 Career Points' },
      ];
  }
}

interface Props {
  cricket: LeaderboardEntry[];
  football: LeaderboardEntry[];
  badmintonSingles: LeaderboardEntry[];
  badmintonDoubles: LeaderboardEntry[];
  /** TT split mirrors badminton — same singles/doubles heuristic. */
  tableTennisSingles: LeaderboardEntry[];
  tableTennisDoubles: LeaderboardEntry[];
  /** Foosball — same heuristic as TT/badminton. */
  foosballSingles: LeaderboardEntry[];
  foosballDoubles: LeaderboardEntry[];
  all: LeaderboardEntry[];
}

export default function LeaderboardClient({
  cricket,
  football,
  badmintonSingles,
  badmintonDoubles,
  tableTennisSingles,
  tableTennisDoubles,
  foosballSingles,
  foosballDoubles,
  all,
}: Props) {
  const [active, setActive] = useState<TabKey>('all');
  const [mode, setMode] = useState<LeaderboardMode>('points');
  const [setFormat, setSetFormat] = useState<SetFormat>('singles');

  // Active entries depend on sport (and, for set sports, the format toggle).
  const entries: LeaderboardEntry[] =
      active === 'all'          ? all
    : active === 'cricket'      ? cricket
    : active === 'football'     ? football
    : active === 'badminton'    ? (setFormat === 'singles' ? badmintonSingles : badmintonDoubles)
    : active === 'table_tennis' ? (setFormat === 'singles' ? tableTennisSingles : tableTennisDoubles)
    : /* foosball */              (setFormat === 'singles' ? foosballSingles : foosballDoubles);

  const modes = modesForSport(active);
  // If the user changes sports and the previous mode no longer applies
  // (e.g. they were on Wickets and switched to football), fall back to
  // Points which is universal.
  const safeMode: LeaderboardMode = modes.some(m => m.value === mode) ? mode : 'points';

  const isSetSport = active === 'badminton' || active === 'table_tennis' || active === 'foosball';

  // Headline counts on the sport tab — for set sports we count distinct
  // player IDs across both formats so the chip reflects "people who have
  // played this sport at all".
  const tabCount = (k: TabKey): number => {
    if (k === 'all')          return all.length;
    if (k === 'cricket')      return cricket.length;
    if (k === 'football')     return football.length;
    if (k === 'badminton') {
      const ids = new Set([...badmintonSingles.map(e => e.player_id), ...badmintonDoubles.map(e => e.player_id)]);
      return ids.size;
    }
    if (k === 'table_tennis') {
      const ids = new Set([...tableTennisSingles.map(e => e.player_id), ...tableTennisDoubles.map(e => e.player_id)]);
      return ids.size;
    }
    if (k === 'foosball') {
      const ids = new Set([...foosballSingles.map(e => e.player_id), ...foosballDoubles.map(e => e.player_id)]);
      return ids.size;
    }
    return 0;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Sport tabs — grid wraps to a second row on narrow screens so users
          never have to discover horizontal scroll to find a sport. */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setActive(t.key);
              // Reset rank mode when switching sports — the previous mode
              // may not apply (e.g. "Wickets" makes no sense in football).
              setMode('points');
              if (t.key === 'badminton' || t.key === 'table_tennis' || t.key === 'foosball') setSetFormat('singles');
            }}
            className={`py-2 px-1 text-xs sm:text-sm font-semibold rounded-lg transition-colors text-center ${
              active === t.key ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="block truncate">
              {t.key === 'all' ? <span className="mr-0.5">🌟</span> : <SportIcon sport={t.key} className="mr-1" />}
              {t.label}
            </span>
            <span className="text-[10px] font-normal text-gray-500">({tabCount(t.key)})</span>
          </button>
        ))}
      </div>

      {/* Singles / Doubles toggle for set sports */}
      {isSetSport && (
        <div className="flex bg-gray-900/80 border border-gray-800 rounded-xl p-1 gap-1">
          {(['singles', 'doubles'] as const).map(sub => {
            const count =
              active === 'badminton'
                ? (sub === 'singles' ? badmintonSingles.length : badmintonDoubles.length)
              : active === 'table_tennis'
                ? (sub === 'singles' ? tableTennisSingles.length : tableTennisDoubles.length)
              : /* foosball */
                (sub === 'singles' ? foosballSingles.length : foosballDoubles.length);
            return (
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
                  ({count} ranked)
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Rank-mode chips. For cricket/football this surfaces discipline
          ranks (Top Run Scorer, Top Wicket Taker, etc) alongside the
          universal Skill / Points pair. */}
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="text-gray-500 self-center mr-1">Rank by:</span>
        {modes.map(m => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            className={`px-3 py-1 rounded-full font-semibold transition-colors border ${
              safeMode === m.value
                ? 'bg-emerald-700/50 text-emerald-200 border-emerald-700/50'
                : 'border-gray-800 bg-gray-900 text-gray-500 hover:text-gray-300 hover:border-gray-700'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <LeaderboardList
        entries={entries}
        mode={safeMode}
        sport={active === 'all' ? 'all' : (active as SportKey)}
        emptyMessage={
          active === 'all'
            ? 'No players yet.'
            : isSetSport
              ? `No ${setFormat} matches recorded for ${TABS.find(t => t.key === active)?.label} yet.`
              : `No players have played ${active.replace('_', ' ')} yet.`
        }
      />
    </div>
  );
}
