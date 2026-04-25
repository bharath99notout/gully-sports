import type { RacquetDetail } from '@/lib/athleteData';
import { StatTile } from './CricketStatsSection';

interface Props {
  detail: RacquetDetail;
  /** badminton splits into singles/doubles; table tennis hides this section */
  showFormatSplit?: boolean;
}

export default function RacquetStatsPanel({ detail, showFormatSplit = false }: Props) {
  if (detail.matches === 0) return null;

  const showSplit = showFormatSplit
    && (detail.singlesMatches > 0 || detail.doublesMatches > 0);

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

          <StatTile
            value={detail.longestWinStreak}
            label="Longest streak"
            accent={detail.longestWinStreak >= 3}
          />
          <StatTile
            value={detail.straightSetWins}
            label="Straight-set wins"
            hint="Won without dropping a set"
            accent={detail.straightSetWins > 0}
          />
          <StatTile
            value={detail.comebackWins}
            label="Comeback wins"
            hint="Won after losing 1st set"
            accent={detail.comebackWins > 0}
          />
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Sets</p>
        <div className="grid grid-cols-3 gap-2">
          <StatTile value={detail.setsWon} label="Sets won" accent />
          <StatTile value={detail.setsLost} label="Sets lost" />
          <StatTile
            value={`${Math.round(detail.setWinRate * 100)}%`}
            label="Set win rate"
            accent={detail.setWinRate >= 0.5}
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
