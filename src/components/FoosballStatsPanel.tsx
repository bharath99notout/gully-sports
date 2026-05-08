import type { FoosballDetail } from '@/lib/athleteData';
import { StatTile } from './CricketStatsSection';

export default function FoosballStatsPanel({ detail }: { detail: FoosballDetail }) {
  if (detail.matches === 0) return null;

  const showSplit = detail.singlesMatches > 0 || detail.doublesMatches > 0;

  return (
    <div className="flex flex-col gap-4 mt-2">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Match record</p>
        <div className="grid grid-cols-3 gap-2">
          <StatTile value={detail.matches} label="Matches" />
          <StatTile value={detail.wins} label="Wins" accent />
          <StatTile
            value={`${Math.round(detail.winRate * 100)}%`}
            label="Win rate"
            accent={detail.winRate >= 0.5}
          />

          <StatTile value={detail.losses} label="Losses" />
          <StatTile
            value={detail.longestWinStreak}
            label="Longest streak"
            accent={detail.longestWinStreak >= 3}
          />
        </div>
      </div>

      {showSplit && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Format split</p>
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              value={`${detail.singlesWins} / ${detail.singlesMatches}`}
              label="Singles W/M"
              accent={detail.singlesMatches > 0}
            />
            <StatTile
              value={`${detail.doublesWins} / ${detail.doublesMatches}`}
              label="Doubles W/M"
              accent={detail.doublesMatches > 0}
            />
          </div>
        </div>
      )}
    </div>
  );
}
