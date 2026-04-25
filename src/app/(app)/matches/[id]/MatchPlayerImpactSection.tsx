import Link from 'next/link';
import type { MatchPlayerImpactRow } from '@/lib/matchImpact';

/** Read-only breakdown: career points from this match + one-match caliber snapshot. */
export default function MatchPlayerImpactSection({ rows }: { rows: MatchPlayerImpactRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4">
      <h2 className="text-sm font-semibold text-white mb-1">Per-player impact (this match)</h2>
      <p className="text-[11px] text-gray-500 mb-3">
        Career points use the same rules as your profile totals. Caliber here is computed as if this were your only match in the sport (for transparency, not your real rating).
      </p>
      <ul className="flex flex-col gap-3">
        {rows.map(row => (
          <li
            key={row.player_id}
            className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2.5 flex flex-col gap-1.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/players/${row.player_id}`}
                  className="text-sm font-semibold text-emerald-400 hover:text-emerald-300 truncate"
                >
                  {row.name}
                </Link>
                <p className="text-[11px] text-gray-500 truncate">
                  {row.team_name}
                  {row.won && <span className="text-emerald-500 ml-1">· Won</span>}
                  {row.was_mvp && <span className="text-amber-400 ml-1">· MVP</span>}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-white tabular-nums">+{row.career_points} pts</p>
                <p className="text-[10px] text-gray-500">
                  Caliber <span className="text-gray-300">{row.caliber_this_match}</span>
                  <span className="text-gray-600"> · </span>
                  {row.caliber_tier}
                </p>
              </div>
            </div>
            <ul className="text-[11px] text-gray-400 list-disc list-inside space-y-0.5">
              {row.stat_lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
