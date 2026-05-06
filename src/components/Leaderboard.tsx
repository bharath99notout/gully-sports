'use client';

import CricketStyleLeaderboard from './CricketStyleLeaderboard';
import { categoriesForSport } from '@/lib/leaderboardCategories';
import type { Leaderboards, PlayerAggregate } from '@/lib/tournament';

/**
 * Single source of truth for any "leaderboard inside a sport context"
 * (tournament *or* event). Two render paths:
 *
 *   • Cricket / football → tabbed Batting/Bowling/Fielding or Goals/Wins
 *     table via `CricketStyleLeaderboard`, with search + Show-all.
 *   • Badminton / table_tennis → plain "Most Wins" card list (no
 *     batting/bowling split makes sense for set-based sports).
 *
 * `aggregates` is required for the cricket/football path.
 * `leaderboards` is required for the single-metric (badminton/TT) path.
 * Pass both — the component picks the right path by sport.
 */
export default function Leaderboard({
  sport, aggregates, leaderboards,
}: {
  sport: string;
  aggregates: PlayerAggregate[];
  leaderboards: Leaderboards;
}) {
  const categories = categoriesForSport(sport);

  if (categories.length > 0) {
    return <CricketStyleLeaderboard sport={sport} aggregates={aggregates} />;
  }

  // Single-metric sports (badminton / table_tennis).
  if (leaderboards.primary.every(l => l.entries.length === 0)) {
    return (
      <p className="text-sm text-gray-500 bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
        No stats yet — leaderboards build up as matches finish.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {leaderboards.primary.map(lb => (
        <div key={lb.key} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">{lb.label}</h3>
          {lb.entries.length === 0 ? (
            <p className="text-xs text-gray-500">No data yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {lb.entries.map((e, i) => {
                const tone =
                  i === 0 ? 'text-yellow-400' :
                  i === 1 ? 'text-gray-300'   :
                  i === 2 ? 'text-orange-400' :
                            'text-gray-600';
                return (
                  <div key={e.player_id} className="flex items-center gap-3 text-sm">
                    <span className={`w-6 text-center font-mono text-xs ${tone}`}>{i + 1}</span>
                    <span className="flex-1 text-white">{e.player_name}</span>
                    <span className="text-emerald-400 font-semibold tabular-nums">{e.display}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
