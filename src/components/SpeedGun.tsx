'use client';

import { useEffect, useRef, useState } from 'react';
import { Zap, Check } from 'lucide-react';
import { createBowlingDelivery } from '@/app/actions/bowlingDeliveries';

/**
 * Two-tap bowling speed gun. Self-contained and reusable.
 *
 * The user taps once when the bowler releases the ball and again when it
 * pitches; we time the interval and divide by the chosen pitch length to
 * compute km/h. After several iterations of video + AI experiments that
 * didn't deliver on amateur gully footage, this is the production path —
 * frame-precise enough for bragging-rights speed numbers, works on any
 * phone, no cloud dependencies, no model bundling.
 *
 * Reuse points:
 *   * CricketScorer's bowler card — tied to live match + bowler
 *   * Dashboard launcher — solo practice, no match context
 *   * /bowling listing page — quick add from history view
 *
 * Outlier guard: readings outside 30-140 km/h are rejected with a retry
 * prompt rather than saved as junk. Matches the server-side guardrail in
 * createBowlingDelivery; UI catches it earlier so the user doesn't have
 * to round-trip to find out a tap was off.
 */

type Phase = 'idle' | 'timing' | 'result';

const PITCH_PRESETS = [
  { label: 'Full pitch',  meters: 20.12 },
  { label: 'Half pitch',  meters: 11.0  },
  { label: 'Net / short', meters: 14.0  },
];

const MIN_KMH = 30;
const MAX_KMH = 140;

export interface SpeedGunProps {
  /** Live match id — set when launched from CricketScorer so the delivery rolls into the match. */
  matchId?: string | null;
  /** Over index (e.g. 4.3 = 4th over, 3rd ball). Best-effort; optional. */
  overIndex?: number | null;
  /** Pitch length to seed the picker. Defaults to standard 20.12 m. */
  defaultDistance?: number;
  /** Fires after a successful save — parent typically closes the modal here. */
  onSaved?: () => void;
  /** Fires when the user dismisses. */
  onCancel?: () => void;
  /** Render a Cancel button when true (modal context). Off for inline use. */
  showCancel?: boolean;
}

export default function SpeedGun({
  matchId, overIndex, defaultDistance = 20.12,
  onSaved, onCancel, showCancel = true,
}: SpeedGunProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [distance, setDistance] = useState<number>(defaultDistance);
  const releaseAt = useRef<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [speedKmh, setSpeedKmh]     = useState<number | null>(null);
  const [isOutlier, setIsOutlier]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Space-bar drives the timing on desktop — useful for testing without
  // touching the screen. No-ops on mobile where Space isn't sent.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== 'Space') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      handleTap();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function handleTap() {
    if (phase === 'idle' || phase === 'result') {
      releaseAt.current = performance.now();
      setPhase('timing');
      setError(null);
      setDurationMs(null);
      setSpeedKmh(null);
      setIsOutlier(false);
      return;
    }
    if (phase === 'timing' && releaseAt.current != null) {
      const dur = performance.now() - releaseAt.current;
      const kmh = Math.round((distance / (dur / 1000)) * 3.6 * 10) / 10;
      setDurationMs(dur);
      setSpeedKmh(kmh);
      setIsOutlier(kmh < MIN_KMH || kmh > MAX_KMH);
      setPhase('result');
    }
  }

  async function save() {
    if (durationMs == null) return;
    setSaving(true);
    setError(null);
    const r = await createBowlingDelivery({
      durationMs: Math.round(durationMs),
      distanceM:  distance,
      matchId:    matchId ?? null,
      overIndex:  overIndex ?? null,
    });
    setSaving(false);
    if (!r.ok) { setError(r.error); return; }
    onSaved?.();
  }

  function reset() {
    releaseAt.current = null;
    setDurationMs(null);
    setSpeedKmh(null);
    setIsOutlier(false);
    setError(null);
    setPhase('idle');
  }

  return (
    <div className="flex flex-col gap-4">
      <DistancePicker
        value={distance}
        onChange={d => { setDistance(d); reset(); }}
        disabled={phase === 'timing'}
      />

      {phase === 'idle' && (
        <TapSurface
          onTap={handleTap}
          title="Tap when bowler releases"
          subtitle="You'll tap again when the ball pitches."
          accent="emerald"
        />
      )}

      {phase === 'timing' && (
        <TapSurface
          onTap={handleTap}
          title="Tap when the ball pitches"
          subtitle="Don't wait for the bat — tap on bounce."
          accent="amber"
        />
      )}

      {phase === 'result' && speedKmh != null && (
        isOutlier ? (
          <OutlierCard speedKmh={speedKmh} onRetry={reset} />
        ) : (
          <ResultCard
            speedKmh={speedKmh}
            durationMs={durationMs ?? 0}
            distance={distance}
            saving={saving}
            error={error}
            onSave={save}
            onRetry={reset}
          />
        )
      )}

      {showCancel && phase !== 'timing' && (
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="self-center text-xs text-gray-500 hover:text-gray-300 underline-offset-2 hover:underline disabled:opacity-40"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

function DistancePicker({
  value, onChange, disabled,
}: { value: number; onChange: (n: number) => void; disabled: boolean }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
        Pitch length
      </p>
      <div className="flex gap-2 flex-wrap">
        {PITCH_PRESETS.map(p => {
          const active = Math.abs(value - p.meters) < 0.01;
          return (
            <button
              key={p.label}
              type="button"
              disabled={disabled}
              onClick={() => onChange(p.meters)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-50 ${
                active
                  ? 'bg-emerald-500 text-gray-950'
                  : 'bg-gray-800 text-gray-300 border border-gray-700 hover:border-gray-600'
              }`}
            >
              {p.label} · {p.meters} m
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TapSurface({
  onTap, title, subtitle, accent,
}: { onTap: () => void; title: string; subtitle: string; accent: 'emerald' | 'amber' }) {
  const ring = accent === 'emerald' ? 'ring-emerald-500/40' : 'ring-amber-500/40';
  const bg   = accent === 'emerald' ? 'bg-emerald-500/10'   : 'bg-amber-500/10';
  const text = accent === 'emerald' ? 'text-emerald-200'    : 'text-amber-200';
  const pulse = accent === 'emerald' ? 'bg-emerald-500'     : 'bg-amber-500';
  return (
    <button
      type="button"
      onClick={onTap}
      className={`relative flex flex-col items-center justify-center gap-3 rounded-3xl border border-gray-800 ${bg} ring-2 ${ring} px-6 py-12 min-h-[220px] active:scale-[0.985] transition-transform`}
    >
      <span className="relative inline-flex h-4 w-4">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${pulse} opacity-60`} />
        <span className={`relative inline-flex h-4 w-4 rounded-full ${pulse}`} />
      </span>
      <span className={`text-lg font-bold ${text}`}>{title}</span>
      <span className="text-xs text-gray-400 max-w-[28ch] text-center leading-relaxed">
        {subtitle}
      </span>
    </button>
  );
}

function OutlierCard({ speedKmh, onRetry }: { speedKmh: number; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-900/60 bg-rose-950/30 p-5 flex flex-col items-center gap-2 text-center">
      <p className="text-[11px] font-bold uppercase tracking-wider text-rose-400">Tap timing looked off</p>
      <p className="text-3xl font-extrabold text-rose-200 tabular-nums">{speedKmh.toFixed(1)} km/h</p>
      <p className="text-xs text-gray-400 max-w-[28ch] leading-relaxed">
        That&apos;s outside {MIN_KMH}–{MAX_KMH} km/h. We won&apos;t save it. Try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 rounded-xl bg-gray-800 hover:bg-gray-700 px-4 py-2 text-sm font-semibold text-gray-100"
      >
        Try again
      </button>
    </div>
  );
}

function ResultCard({
  speedKmh, durationMs, distance, saving, error, onSave, onRetry,
}: {
  speedKmh: number; durationMs: number; distance: number;
  saving: boolean; error: string | null; onSave: () => void; onRetry: () => void;
}) {
  return (
    <div className="rounded-2xl border border-emerald-900/60 bg-emerald-950/30 p-5 flex flex-col items-center gap-2 text-center">
      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 inline-flex items-center gap-1">
        <Zap size={11} fill="currentColor" /> Delivery speed
      </p>
      <p className="text-5xl font-extrabold text-white tabular-nums leading-none">
        {speedKmh.toFixed(1)}
        <span className="text-xl text-emerald-300 font-bold ml-2">km/h</span>
      </p>
      <p className="text-[11px] text-gray-500">
        {distance.toFixed(2)} m · {Math.round(durationMs)} ms
      </p>
      {error && (
        <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-900/60 rounded-lg px-3 py-2 max-w-full">
          {error}
        </p>
      )}
      <div className="mt-2 flex gap-2 w-full">
        <button
          type="button"
          onClick={onRetry}
          disabled={saving}
          className="flex-1 rounded-xl bg-gray-800 hover:bg-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-100 disabled:opacity-50"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex-[2] rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-2.5 text-sm font-bold text-gray-950 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
        >
          {saving ? 'Saving…' : (<><Check size={14} /> Save delivery</>)}
        </button>
      </div>
    </div>
  );
}
