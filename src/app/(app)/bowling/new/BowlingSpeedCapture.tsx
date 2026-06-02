'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBowlingDelivery } from '@/app/actions/bowlingDeliveries';

type Phase = 'idle' | 'armed' | 'timing' | 'result';

const PRESETS = [
  { label: 'Full pitch', meters: 20.12 },
  { label: 'Half pitch', meters: 11.0  },
  { label: 'Net / short', meters: 14.0 },
];

export default function BowlingSpeedCapture() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [distance, setDistance] = useState<number>(20.12);
  const releaseAt = useRef<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [speedKmh,   setSpeedKmh]   = useState<number | null>(null);
  const [isOutlier,  setIsOutlier]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Allow space-bar to drive the timing on desktop — fine for testing,
  // doesn't get in the way on mobile.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== 'Space') return;
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
      return;
    }
    if (phase === 'timing' && releaseAt.current != null) {
      const dur = performance.now() - releaseAt.current;
      const kmh = Math.round((distance / (dur / 1000)) * 3.6 * 10) / 10;
      setDurationMs(dur);
      setSpeedKmh(kmh);
      setIsOutlier(kmh < 30 || kmh > 140);
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
    });
    setSaving(false);
    if (!r.ok) { setError(r.error); return; }
    router.push('/bowling');
    router.refresh();
  }

  function reset() {
    releaseAt.current = null;
    setDurationMs(null);
    setSpeedKmh(null);
    setIsOutlier(false);
    setError(null);
    setPhase('idle');
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      <DistancePicker
        value={distance}
        onChange={d => { setDistance(d); reset(); }}
        disabled={phase === 'timing'}
      />

      {phase === 'idle' && (
        <CaptureSurface
          onTap={handleTap}
          title="Tap when bowler releases the ball"
          subtitle="You'll tap again when it pitches or reaches the batter."
          accent="emerald"
        />
      )}

      {phase === 'timing' && (
        <CaptureSurface
          onTap={handleTap}
          title="Tap when the ball pitches"
          subtitle="Don't wait for the bat — tap on bounce."
          accent="amber"
        />
      )}

      {phase === 'result' && speedKmh != null && (
        <ResultCard
          speedKmh={speedKmh}
          isOutlier={isOutlier}
          distance={distance}
          durationMs={durationMs ?? 0}
          onSave={save}
          onRetry={reset}
          saving={saving}
          error={error}
        />
      )}

      <p className="text-[11px] text-gray-500 leading-relaxed">
        How it works · we time the gap between your two taps and divide by the
        pitch length you picked above. Practice mode — no match needed.
      </p>
    </div>
  );
}

function DistancePicker({
  value, onChange, disabled,
}: {
  value: number; onChange: (n: number) => void; disabled: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
        Pitch length
      </p>
      <div className="flex gap-2 flex-wrap">
        {PRESETS.map(p => {
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

function CaptureSurface({
  onTap, title, subtitle, accent,
}: {
  onTap: () => void; title: string; subtitle: string; accent: 'emerald' | 'amber';
}) {
  const ringCls   = accent === 'emerald' ? 'ring-emerald-500/40' : 'ring-amber-500/40';
  const glowCls   = accent === 'emerald' ? 'bg-emerald-500/10'   : 'bg-amber-500/10';
  const textCls   = accent === 'emerald' ? 'text-emerald-300'    : 'text-amber-300';
  const pulseCls  = accent === 'emerald' ? 'bg-emerald-500'      : 'bg-amber-500';
  return (
    <button
      type="button"
      onClick={onTap}
      className={`relative flex flex-col items-center justify-center gap-3 rounded-3xl border border-gray-800 ${glowCls} ring-2 ${ringCls} px-6 py-12 min-h-[260px] active:scale-[0.985] transition-transform`}
    >
      <span className="relative inline-flex h-4 w-4">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${pulseCls} opacity-60`} />
        <span className={`relative inline-flex h-4 w-4 rounded-full ${pulseCls}`} />
      </span>
      <span className={`text-lg font-bold ${textCls}`}>{title}</span>
      <span className="text-xs text-gray-400 max-w-[28ch] text-center leading-relaxed">
        {subtitle}
      </span>
    </button>
  );
}

function ResultCard({
  speedKmh, isOutlier, distance, durationMs, onSave, onRetry, saving, error,
}: {
  speedKmh: number;
  isOutlier: boolean;
  distance: number;
  durationMs: number;
  onSave: () => void;
  onRetry: () => void;
  saving: boolean;
  error: string | null;
}) {
  if (isOutlier) {
    return (
      <div className="rounded-3xl border border-rose-900/60 bg-rose-950/30 p-6 flex flex-col items-center gap-3 text-center">
        <p className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
          Tap timing looked off
        </p>
        <p className="text-3xl font-extrabold text-rose-200 tabular-nums">
          {speedKmh.toFixed(1)} km/h
        </p>
        <p className="text-xs text-gray-400 max-w-[28ch] leading-relaxed">
          That&apos;s outside 30–140 km/h, so we won&apos;t add it to your average. Tap again to retry.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-xl bg-gray-800 hover:bg-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-100"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-emerald-900/60 bg-emerald-950/30 p-6 flex flex-col items-center gap-3 text-center">
      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
        Delivery speed
      </p>
      <p className="text-6xl font-extrabold text-white tabular-nums leading-none">
        {speedKmh.toFixed(1)}
        <span className="text-2xl text-emerald-300 font-bold ml-2">km/h</span>
      </p>
      <p className="text-[11px] text-gray-500">
        {distance.toFixed(2)} m · {Math.round(durationMs)} ms
      </p>
      {error && (
        <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-900/60 rounded-lg px-3 py-2">
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
          className="flex-[2] rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-2.5 text-sm font-bold text-gray-950 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save delivery'}
        </button>
      </div>
    </div>
  );
}
