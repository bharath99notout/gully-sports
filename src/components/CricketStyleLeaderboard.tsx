'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import type { PlayerAggregate } from '@/lib/tournament';
import { categoriesForSport } from '@/lib/leaderboardCategories';

const DEFAULT_VISIBLE = 25;

/**
 * Sub-tabbed leaderboard table — Batting / Bowling / Fielding for cricket;
 * Goals / Wins for football. Used by both the tournament and per-event
 * leaderboard views. Single-metric sports (badminton / TT) bypass this and
 * render a simpler card list at the call site.
 */
export default function CricketStyleLeaderboard({
  sport, aggregates,
}: {
  sport: string;
  aggregates: PlayerAggregate[];
}) {
  const categories = categoriesForSport(sport);
  const [activeKey, setActiveKey] = useState<string>(categories[0]?.key ?? '');
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  if (categories.length === 0) return null;

  const active = categories.find(c => c.key === activeKey) ?? categories[0];

  const baseFiltered = aggregates
    .filter(active.filter)
    .sort((a, b) => active.sortBy(b) - active.sortBy(a));

  const rankByPlayer = new Map<string, number>();
  baseFiltered.forEach((a, i) => rankByPlayer.set(a.player_id, i + 1));

  const visibleFiltered = baseFiltered
    .filter(a => a.player_name.toLowerCase().includes(query.trim().toLowerCase()));
  const visible = showAll ? visibleFiltered : visibleFiltered.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = Math.max(0, visibleFiltered.length - DEFAULT_VISIBLE);

  return (
    <div className="flex flex-col gap-3">
      <nav className="flex gap-1 border-b border-gray-800 overflow-x-auto">
        {categories.map(c => (
          <button
            key={c.key}
            type="button"
            onClick={() => { setActiveKey(c.key); setShowAll(false); }}
            className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors border-b-2 ${
              c.key === active.key
                ? 'text-emerald-400 border-emerald-400'
                : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            {c.label}
          </button>
        ))}
      </nav>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search player…"
          className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-700"
        />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        {visibleFiltered.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">
            {query ? 'No players match that search.' : 'No data yet for this category.'}
          </p>
        ) : (
          <>
            <div
              className="grid items-center gap-2 px-3 py-2 border-b border-gray-800 bg-gray-800/30 text-[10px] uppercase tracking-wider text-gray-500 font-semibold"
              style={{ gridTemplateColumns: `2rem minmax(0,1fr) repeat(${active.cols.length}, 3rem)` }}
            >
              <span className="text-center">#</span>
              <span>Player</span>
              {active.cols.map(c => (
                <span key={c.key} className={c.align === 'right' ? 'text-right' : ''}>{c.label}</span>
              ))}
            </div>
            <div>
              {visible.map(a => {
                const rank = rankByPlayer.get(a.player_id) ?? 0;
                return (
                  <div
                    key={a.player_id}
                    className="grid items-center gap-2 px-3 py-2 border-b border-gray-800/40 last:border-0 text-sm"
                    style={{ gridTemplateColumns: `2rem minmax(0,1fr) repeat(${active.cols.length}, 3rem)` }}
                  >
                    <RankBadge rank={rank} />
                    <span className="text-white truncate">{a.player_name}</span>
                    {active.cols.map(c => {
                      const isPrimary = c.key === active.cols.find(x => /^(R|G|W|Goals|C|Wins)$/.test(x.key))?.key;
                      return (
                        <span
                          key={c.key}
                          className={`tabular-nums ${c.align === 'right' ? 'text-right' : ''} ${
                            isPrimary ? 'text-emerald-400 font-semibold' : 'text-gray-400'
                          }`}
                        >
                          {active.cell(a, c.key)}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {!showAll && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-xs text-emerald-400 hover:text-emerald-300 self-center"
        >
          Show all {visibleFiltered.length} players ({hiddenCount} more)
        </button>
      )}
      {showAll && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="text-xs text-gray-400 hover:text-gray-200 self-center"
        >
          Show top {DEFAULT_VISIBLE} only
        </button>
      )}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const tone =
    rank === 1 ? 'text-yellow-400' :
    rank === 2 ? 'text-gray-300'   :
    rank === 3 ? 'text-orange-400' :
                 'text-gray-600';
  return <span className={`text-center font-mono text-xs ${tone}`}>{rank || '–'}</span>;
}
