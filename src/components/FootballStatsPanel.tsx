import type { FootballDetail } from '@/lib/athleteData';
import { StatTile } from './CricketStatsSection';

export default function FootballStatsPanel({ detail }: { detail: FootballDetail }) {
  if (detail.matches === 0) return null;

  return (
    <div className="flex flex-col gap-4 mt-2">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Scoring</p>
        <div className="grid grid-cols-3 gap-2">
          <StatTile value={detail.totalGoals} label="Goals" accent />
          <StatTile value={detail.matches} label="Matches" />
          <StatTile value={detail.bestMatchGoals} label="Best match" accent={detail.bestMatchGoals >= 2} />

          <StatTile
            value={detail.goalsPerMatch.toFixed(2)}
            label="Goals / match"
            accent={detail.goalsPerMatch >= 1}
          />
          <StatTile value={detail.hatTricks} label="Hat-tricks" accent={detail.hatTricks > 0} />
          <StatTile value={detail.cleanWins} label="Wins w/ goal" />
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Results</p>
        <div className="grid grid-cols-3 gap-2">
          <StatTile value={detail.wins} label="Wins" accent />
          <StatTile value={detail.losses} label="Losses" />
          <StatTile
            value={`${Math.round(detail.winRate * 100)}%`}
            label="Win rate"
            accent={detail.winRate >= 0.5}
          />
        </div>
      </div>

      <p className="text-[10px] text-gray-700 italic">
        Assists & cards coming soon — we&apos;ll capture them in the scorer next.
      </p>
    </div>
  );
}
