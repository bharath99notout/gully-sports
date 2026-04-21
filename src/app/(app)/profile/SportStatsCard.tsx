'use client';

import { useState } from 'react';

type SportKey = 'cricket' | 'football' | 'badminton';
interface SportStat {
  matches: number; wins: number; runs: number;
  wickets: number; catches: number; goals: number;
}

const tabs: { key: SportKey; emoji: string; label: string }[] = [
  { key: 'cricket', emoji: '🏏', label: 'Cricket' },
  { key: 'football', emoji: '⚽', label: 'Football' },
  { key: 'badminton', emoji: '🏸', label: 'Badminton' },
];

export default function SportStatsCard({ sportStats }: { sportStats: Record<SportKey, SportStat> }) {
  const [active, setActive] = useState<SportKey>('cricket');
  const s = sportStats[active];

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActive(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm transition-colors ${
              active === t.key
                ? 'border-b-2 border-emerald-500 text-white font-medium'
                : 'text-gray-600 hover:text-gray-400'
            }`}>
            <span>{t.emoji}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Stats grid */}
      <div className="pt-4">
        {s.matches === 0 ? (
          <p className="text-sm text-gray-600 text-center py-3">No {active} matches yet.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            <StatBox value={s.matches} label="Matches" />
            <StatBox value={s.wins} label="Wins" color="text-emerald-400" />
            <StatBox value={s.matches - s.wins} label="Losses" color="text-red-400" />
            {active === 'cricket' && <StatBox value={s.runs} label="Runs" color="text-blue-400" />}
            {active === 'cricket' && <StatBox value={s.wickets} label="Wickets" color="text-purple-400" />}
            {active === 'cricket' && <StatBox value={s.catches} label="Catches" color="text-yellow-400" />}
            {active === 'cricket' && s.matches > 0 && (
              <StatBox value={s.matches > 0 ? (s.runs / s.matches).toFixed(1) : '0'} label="Avg" color="text-cyan-400" />
            )}
            {active === 'football' && <StatBox value={s.goals} label="Goals" color="text-green-400" />}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ value, label, color = 'text-white' }: { value: number | string; label: string; color?: string }) {
  return (
    <div className="bg-gray-800/60 rounded-xl p-3 text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
