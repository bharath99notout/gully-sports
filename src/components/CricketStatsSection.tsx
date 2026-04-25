import type { CricketDetail } from '@/lib/athleteData';

interface Props {
  detail: CricketDetail;
}

function fmt(n: number | null, digits = 2): string {
  if (n === null || !isFinite(n)) return '–';
  return Number.isInteger(n) && digits === 2 ? String(n) : n.toFixed(digits);
}

export function StatTile({ value, label, hint, accent = false }: {
  value: string | number;
  label: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={`bg-gray-950/60 border rounded-xl px-3 py-2.5 flex flex-col gap-0.5 ${
      accent ? 'border-emerald-800/60' : 'border-gray-800'
    }`}>
      <div className={`text-lg font-bold tabular-nums leading-tight ${
        accent ? 'text-emerald-400' : 'text-white'
      }`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 leading-tight">{label}</div>
      {hint && <div className="text-[10px] text-gray-600 leading-tight">{hint}</div>}
    </div>
  );
}

/**
 * Detailed cricket stats panel (no card chrome — render inside an accordion).
 * Returns null when the player has no batting / bowling / fielding activity.
 */
export default function CricketStatsSection({ detail }: Props) {
  const showBatting = detail.innings > 0;
  const showBowling = detail.bowlingInnings > 0 || detail.totalWickets > 0;
  if (!showBatting && !showBowling && detail.totalCatches === 0) return null;

  const bbf = detail.bestBowling
    ? `${detail.bestBowling.wickets}/${detail.bestBowling.runs}`
    : '–';
  const overs = detail.ballsBowled > 0
    ? `${Math.floor(detail.ballsBowled / 6)}.${detail.ballsBowled % 6}`
    : '–';

  return (
    <div className="flex flex-col gap-4 mt-2">
      {showBatting && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Batting</p>
          <div className="grid grid-cols-3 gap-2">
            <StatTile value={detail.totalRuns} label="Runs" accent />
            <StatTile value={detail.innings} label="Innings" />
            <StatTile value={detail.highestScore} label="Highest" accent />

            <StatTile value={detail.centuries} label="Centuries" accent={detail.centuries > 0} />
            <StatTile value={detail.fifties} label="Half-centuries" accent={detail.fifties > 0} />
            <StatTile value={detail.notOuts} label="Not outs" />

            <StatTile value={detail.fours} label="Fours" />
            <StatTile value={detail.sixes} label="Sixes" />
            <StatTile value={detail.ducks} label="Ducks" />

            <StatTile
              value={fmt(detail.battingAverage, 2)}
              label="Average"
              hint={detail.battingAverage === null ? 'No dismissals yet' : undefined}
              accent={(detail.battingAverage ?? 0) >= 30}
            />
            <StatTile
              value={fmt(detail.strikeRate, 1)}
              label="Strike rate"
              hint={`${detail.ballsFaced} balls`}
              accent={(detail.strikeRate ?? 0) >= 130}
            />
            <StatTile
              value={`${Math.round(detail.boundaryPct)}%`}
              label="Boundary %"
              hint="Runs from 4s + 6s"
            />
          </div>
        </div>
      )}

      {showBowling && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Bowling</p>
          <div className="grid grid-cols-3 gap-2">
            <StatTile value={detail.totalWickets} label="Wickets" accent />
            <StatTile value={overs} label="Overs" />
            <StatTile value={bbf} label="Best (W/R)" accent={!!detail.bestBowling && detail.bestBowling.wickets >= 3} />

            <StatTile
              value={fmt(detail.bowlingAverage, 2)}
              label="Average"
              hint={detail.bowlingAverage === null ? 'No wickets yet' : 'Runs per wicket'}
              accent={(detail.bowlingAverage ?? Infinity) < 20 && detail.totalWickets > 0}
            />
            <StatTile
              value={fmt(detail.economy, 2)}
              label="Economy"
              hint={detail.economy === null ? '' : 'Runs per over'}
              accent={(detail.economy ?? Infinity) < 6 && detail.ballsBowled >= 12}
            />
            <StatTile value={detail.runsConceded} label="Runs conceded" />

            <StatTile value={detail.fiveWicketHauls} label="5-wicket hauls" accent={detail.fiveWicketHauls > 0} />
            <StatTile value={detail.threeWicketHauls} label="3-wicket hauls" accent={detail.threeWicketHauls > 0} />
            <StatTile value={detail.totalCatches} label="Catches" />
          </div>
        </div>
      )}

      {!showBatting && !showBowling && detail.totalCatches > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Fielding</p>
          <div className="grid grid-cols-3 gap-2">
            <StatTile value={detail.totalCatches} label="Catches" accent />
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export so other panels can match the same visual language.
export { CricketStatsSection };
