'use client';

import { useCallback, useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { getRecentBowlerSpeeds } from '@/app/actions/bowlingDeliveries';

/**
 * Inline strip that shows the last speed + peak + avg for the current
 * bowler in the current match. Lives inside the bowler card on the
 * CricketScorer so the speed reading isn't a write-and-forget — the
 * user gets immediate feedback after each capture.
 *
 * Refresh model:
 *   * Loads on mount and whenever matchId/bowlerId change.
 *   * Listens for the SpeedGun's `gs:bowling-speed-saved` window event
 *     so a capture in a sibling modal triggers an immediate refetch
 *     without prop drilling or a router refresh.
 *
 * Empty state intentionally minimal — a small "no speed captured" hint
 * so users notice the gun is there. Once one delivery is in, the strip
 * lights up amber with the data.
 */

interface SpeedRow {
  id: string;
  speed_kmh: number;
  recorded_at: string;
}

export default function BowlerSpeedStrip({
  matchId, bowlerId,
}: {
  matchId: string;
  bowlerId: string;
}) {
  // rows = null means "not yet fetched"; [] means "fetched, no deliveries".
  // Deriving the loading flag from this sentinel avoids the
  // react-hooks/set-state-in-effect rule that fires on synchronous
  // setLoading(true) inside useEffect.
  const [rows, setRows] = useState<SpeedRow[] | null>(null);
  const [peak, setPeak] = useState<number | null>(null);
  const [avg, setAvg]   = useState<number | null>(null);
  const loading = rows === null;

  const refresh = useCallback(async () => {
    const r = await getRecentBowlerSpeeds(matchId, bowlerId, 6);
    setRows(r.deliveries);
    setPeak(r.peak);
    setAvg(r.avg);
  }, [matchId, bowlerId]);

  // Syncing local state from an external system (the DB) — the documented
  // React pattern for this is exactly useEffect + setState. The lint rule
  // flow-analyses through refresh() and flags the eventual setRows, but
  // we're not creating a render cascade (refresh awaits a network call).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh(); }, [refresh]);

  // SpeedGun fires a window event on successful save; we refetch then.
  // Keeps the strip fresh without prop drilling through the modal.

  // SpeedGun fires a window event on successful save; we refetch then.
  // Keeps the strip fresh without prop drilling through the modal.
  useEffect(() => {
    function onSaved(e: Event) {
      const detail = (e as CustomEvent<{ matchId?: string; bowlerId?: string }>).detail;
      if (!detail) return refresh();
      // Refetch only if the save was for THIS match (bowler match is loose
      // because SpeedGun doesn't always know the bowlerId at save time).
      if (detail.matchId && detail.matchId !== matchId) return;
      refresh();
    }
    window.addEventListener('gs:bowling-speed-saved', onSaved);
    return () => window.removeEventListener('gs:bowling-speed-saved', onSaved);
  }, [refresh, matchId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/40 px-3 py-2 h-[44px] animate-pulse" />
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-amber-900/30 bg-amber-950/10 px-3 py-2 flex items-center gap-2 text-[11px] text-gray-500">
        <Zap size={11} className="text-amber-400/60" fill="currentColor" />
        No speed captured this spell. Tap <span className="text-amber-300 font-semibold">Speed</span> after a delivery.
      </div>
    );
  }

  const last = rows[0];
  return (
    <div className="rounded-xl border border-amber-900/50 bg-amber-950/15 px-3 py-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1 text-amber-300 font-bold">
          <Zap size={11} fill="currentColor" /> Last
          <span className="text-white tabular-nums ml-1">{last.speed_kmh.toFixed(1)}</span>
          <span className="text-amber-300/80 font-normal">km/h</span>
        </span>
        {peak != null && (
          <span className="text-[11px] text-gray-400">
            Peak <span className="text-white font-semibold tabular-nums">{peak}</span>
          </span>
        )}
        {avg != null && rows.length > 1 && (
          <span className="text-[11px] text-gray-400">
            Avg <span className="text-white font-semibold tabular-nums">{avg}</span>
          </span>
        )}
        <span className="ml-auto text-[10px] text-gray-500">
          {rows.length} {rows.length === 1 ? 'ball' : 'balls'}
        </span>
      </div>
      {rows.length > 1 && (
        <div className="flex items-center gap-1 text-[10px] tabular-nums text-gray-500 overflow-x-auto">
          {rows.slice().reverse().map((r, i) => (
            <span
              key={r.id}
              className={`px-1.5 py-0.5 rounded ${
                i === rows.length - 1 ? 'bg-amber-500/20 text-amber-200 font-semibold' : 'bg-gray-800 text-gray-400'
              }`}
            >
              {r.speed_kmh.toFixed(0)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
