'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Video, Upload, Circle, Square, RotateCcw, ArrowLeft, Sparkles, Hand } from 'lucide-react';
import { createBowlingDelivery } from '@/app/actions/bowlingDeliveries';
import { analyzeDelivery, type AnalysisResult } from '@/lib/bowlingAnalysis/analyzer';

/**
 * Bowling Analyzer capture surface.
 *
 * Two modes user can pick at the top:
 *   • AI auto-detect — pose finds release; object detector tracks the
 *     "sports ball" class and infers bounce from the trajectory.
 *   • Manual marks — user scrubs and taps release + pitch on the timeline.
 *
 * AI is a "best effort" path — gully cricket video is messy. When the
 * analyzer returns low confidence we silently fall back to a hybrid mode:
 * release pre-filled from AI, user marks the bounce.
 *
 * Speed is computed off the video's own timestamps either way — frame
 * precise, no live-tap reaction-time error.
 */

type Mode  = 'ai' | 'manual';
type Phase = 'source' | 'recording' | 'review';
type AiState =
  | { kind: 'idle' }
  | { kind: 'running'; progress: number }
  | { kind: 'done'; result: AnalysisResult }
  | { kind: 'error'; message: string };

const PITCH_PRESETS = [
  { label: 'Full pitch', meters: 20.12 },
  { label: 'Half pitch', meters: 11.0  },
  { label: 'Net / short', meters: 14.0 },
];

const AI_CONFIDENCE_OK = 0.35; // below this we fall back to user-marks-bounce

function fmtClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0.00s';
  return `${seconds.toFixed(2)}s`;
}

export default function BowlingVideoCapture() {
  const router = useRouter();
  const [mode, setMode]   = useState<Mode>('ai');
  const [phase, setPhase] = useState<Phase>('source');
  const [distance, setDistance] = useState<number>(20.12);

  // Live recording
  const previewRef  = useRef<HTMLVideoElement | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const [recError, setRecError] = useState<string | null>(null);

  // Review
  const reviewRef = useRef<HTMLVideoElement | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [releaseSec, setReleaseSec] = useState<number | null>(null);
  const [pitchSec,   setPitchSec]   = useState<number | null>(null);

  // AI
  const [ai, setAi] = useState<AiState>({ kind: 'idle' });

  // Save
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── lifecycle ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (clipUrl) URL.revokeObjectURL(clipUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kick off AI analysis automatically once the clip is ready in AI mode.
  useEffect(() => {
    if (phase !== 'review' || mode !== 'ai' || !clipUrl) return;
    if (ai.kind !== 'idle') return;
    runAi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode, clipUrl]);

  // ── recording ───────────────────────────────────────────────────────────────
  async function startRecording() {
    setRecError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, frameRate: { ideal: 60 } },
        audio: false,
      });
      streamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        previewRef.current.muted = true;
        await previewRef.current.play().catch(() => {});
      }
      chunksRef.current = [];
      const mime = pickMimeType();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime ?? 'video/webm' });
        const url = URL.createObjectURL(blob);
        setClipUrl(url);
        setPhase('review');
      };
      recorderRef.current = rec;
      rec.start();
      setPhase('recording');
    } catch (e) {
      setRecError(e instanceof Error ? e.message : 'Camera access blocked');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  function pickMimeType(): string | null {
    const candidates = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (const m of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
    }
    return null;
  }

  // ── upload ──────────────────────────────────────────────────────────────────
  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (clipUrl) URL.revokeObjectURL(clipUrl);
    setClipUrl(URL.createObjectURL(f));
    setReleaseSec(null);
    setPitchSec(null);
    setAi({ kind: 'idle' });
    setPhase('review');
  }

  // ── AI flow ─────────────────────────────────────────────────────────────────
  async function runAi() {
    if (!reviewRef.current) return;
    const video = reviewRef.current;
    // Make sure metadata is loaded so we know duration.
    if (Number.isNaN(video.duration)) {
      await new Promise<void>(r => {
        const fn = () => { video.removeEventListener('loadedmetadata', fn); r(); };
        video.addEventListener('loadedmetadata', fn);
      });
    }
    setAi({ kind: 'running', progress: 0 });
    try {
      const result = await analyzeDelivery(video, {
        distanceM: distance,
        sampleIntervalMs: 50,
        onProgress: p => setAi({ kind: 'running', progress: p }),
      });
      setAi({ kind: 'done', result });

      // Pre-fill marks from AI results so the manual UI can take over cleanly
      // if confidence is low or the user wants to nudge.
      if (result.releaseMs != null) setReleaseSec(result.releaseMs / 1000);
      if (result.bounceMs  != null) setPitchSec(result.bounceMs  / 1000);
    } catch (e) {
      setAi({ kind: 'error', message: e instanceof Error ? e.message : 'AI analysis failed' });
    }
  }

  // ── marks (manual) ──────────────────────────────────────────────────────────
  function markRelease() { setReleaseSec(reviewRef.current?.currentTime ?? 0); }
  function markPitch()   { setPitchSec(reviewRef.current?.currentTime   ?? 0); }
  function clearMarks()  { setReleaseSec(null); setPitchSec(null); }

  // ── compute ─────────────────────────────────────────────────────────────────
  const durationMs = (releaseSec != null && pitchSec != null && pitchSec > releaseSec)
    ? Math.round((pitchSec - releaseSec) * 1000)
    : null;
  const speedKmh = durationMs != null
    ? Math.round((distance / (durationMs / 1000)) * 3.6 * 10) / 10
    : null;
  const isOutlier = speedKmh != null && (speedKmh < 30 || speedKmh > 140);

  // ── save ────────────────────────────────────────────────────────────────────
  async function save() {
    if (durationMs == null || releaseSec == null || pitchSec == null) return;
    setSaving(true);
    setSaveError(null);
    const fromAi = ai.kind === 'done' && ai.result.releaseMs != null && ai.result.bounceMs != null;
    const r = await createBowlingDelivery({
      durationMs,
      distanceM:    distance,
      recordedVia:  fromAi ? 'camera_cv' : 'video_mark',
      releaseMs:    Math.round(releaseSec * 1000),
      pitchMs:      Math.round(pitchSec   * 1000),
    });
    setSaving(false);
    if (!r.ok) { setSaveError(r.error); return; }
    router.push('/bowling');
    router.refresh();
  }

  function resetAll() {
    if (clipUrl) URL.revokeObjectURL(clipUrl);
    setClipUrl(null);
    setReleaseSec(null);
    setPitchSec(null);
    setSaveError(null);
    setAi({ kind: 'idle' });
    setPhase('source');
  }

  // Auto-fallback signal: AI ran but confidence is below threshold → tell
  // the user, and surface the manual marking UI.
  const aiFallback =
    ai.kind === 'done' && ai.result.confidence < AI_CONFIDENCE_OK;

  // Show the manual marking UI whenever:
  //   - user picked manual mode
  //   - OR AI gave us a low-confidence result
  //   - OR AI errored
  const showManualMarks =
    mode === 'manual' || aiFallback || ai.kind === 'error';

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <ModeToggle
        mode={mode}
        onChange={m => { setMode(m); setAi({ kind: 'idle' }); }}
        disabled={phase === 'recording'}
      />

      <DistancePicker value={distance} onChange={setDistance} disabled={phase === 'recording'} />

      {phase === 'source' && (
        <SourcePicker onRecord={startRecording} onPick={onPickFile} error={recError} />
      )}

      {phase === 'recording' && (
        <RecordingView previewRef={previewRef} onStop={stopRecording} />
      )}

      {phase === 'review' && clipUrl && (
        <ReviewView
          mode={mode}
          ai={ai}
          aiFallback={aiFallback}
          showManualMarks={showManualMarks}
          videoRef={reviewRef}
          clipUrl={clipUrl}
          releaseSec={releaseSec}
          pitchSec={pitchSec}
          onMarkRelease={markRelease}
          onMarkPitch={markPitch}
          onClearMarks={clearMarks}
          onRestart={resetAll}
          onRetryAi={runAi}
          speedKmh={speedKmh}
          isOutlier={isOutlier}
          durationMs={durationMs}
          distance={distance}
          saving={saving}
          saveError={saveError}
          onSave={save}
        />
      )}

      <p className="text-[11px] text-gray-500 leading-relaxed">
        AI mode uses on-device CV (pose detection + sports-ball tracking) — no upload, no
        API key, no rate limits. Accuracy depends on lighting and camera angle; we fall
        back to manual marks if the AI confidence is low.
      </p>
    </div>
  );
}

// ── subcomponents ──────────────────────────────────────────────────────────

function ModeToggle({
  mode, onChange, disabled,
}: { mode: Mode; onChange: (m: Mode) => void; disabled: boolean }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-1 flex gap-1">
      <ModeButton
        active={mode === 'ai'}
        disabled={disabled}
        onClick={() => onChange('ai')}
        icon={<Sparkles size={14} />}
        label="AI auto-detect"
        sub="Pose + ball tracking"
      />
      <ModeButton
        active={mode === 'manual'}
        disabled={disabled}
        onClick={() => onChange('manual')}
        icon={<Hand size={14} />}
        label="Manual marks"
        sub="You tap release + pitch"
      />
    </div>
  );
}

function ModeButton({
  active, disabled, onClick, icon, label, sub,
}: {
  active: boolean; disabled: boolean; onClick: () => void;
  icon: React.ReactNode; label: string; sub: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex-1 rounded-xl px-3 py-2 transition-colors text-left disabled:opacity-50 ${
        active ? 'bg-emerald-500 text-gray-950' : 'text-gray-300 hover:bg-gray-800'
      }`}
    >
      <span className="flex items-center gap-1.5 text-xs font-bold">{icon}{label}</span>
      <span className={`block text-[10px] mt-0.5 ${active ? 'text-gray-900/70' : 'text-gray-500'}`}>{sub}</span>
    </button>
  );
}

function DistancePicker({
  value, onChange, disabled,
}: { value: number; onChange: (n: number) => void; disabled: boolean }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-3">
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

function SourcePicker({
  onRecord, onPick, error,
}: {
  onRecord: () => void;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onRecord}
        className="rounded-2xl border border-emerald-800/60 bg-emerald-950/30 hover:bg-emerald-950/50 px-5 py-5 flex items-center gap-4"
      >
        <span className="h-10 w-10 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/40 flex items-center justify-center">
          <Video size={18} className="text-emerald-300" />
        </span>
        <span className="flex-1 text-left">
          <span className="block text-sm font-bold text-emerald-200">Record now</span>
          <span className="block text-[11px] text-gray-400 mt-0.5">
            Uses your phone&apos;s back camera. Pro tip: use slo-mo mode if available.
          </span>
        </span>
      </button>

      <label className="rounded-2xl border border-sky-800/60 bg-sky-950/25 hover:bg-sky-950/40 px-5 py-5 flex items-center gap-4 cursor-pointer">
        <span className="h-10 w-10 rounded-full bg-sky-500/15 ring-1 ring-sky-500/40 flex items-center justify-center">
          <Upload size={18} className="text-sky-300" />
        </span>
        <span className="flex-1 text-left">
          <span className="block text-sm font-bold text-sky-200">Upload a clip</span>
          <span className="block text-[11px] text-gray-400 mt-0.5">
            From your gallery — pick the slo-mo you recorded earlier.
          </span>
        </span>
        <input
          type="file"
          accept="video/*"
          capture="environment"
          onChange={onPick}
          className="hidden"
        />
      </label>

      {error && (
        <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      )}
    </div>
  );
}

function RecordingView({
  previewRef, onStop,
}: {
  previewRef: React.RefObject<HTMLVideoElement | null>;
  onStop: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative rounded-2xl overflow-hidden border border-rose-900/50 bg-black aspect-[3/4]">
        <video ref={previewRef} playsInline muted className="w-full h-full object-cover" />
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 ring-1 ring-rose-500/40 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-rose-300">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
          </span>
          Recording
        </span>
      </div>
      <button
        type="button"
        onClick={onStop}
        className="rounded-xl bg-rose-500 hover:bg-rose-400 text-gray-950 font-bold px-4 py-3 text-sm inline-flex items-center justify-center gap-2"
      >
        <Square size={14} fill="currentColor" /> Stop &amp; review
      </button>
    </div>
  );
}

function ReviewView(props: {
  mode: Mode;
  ai: AiState;
  aiFallback: boolean;
  showManualMarks: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  clipUrl: string;
  releaseSec: number | null;
  pitchSec:   number | null;
  onMarkRelease: () => void;
  onMarkPitch:   () => void;
  onClearMarks:  () => void;
  onRestart:     () => void;
  onRetryAi:     () => void;
  speedKmh:   number | null;
  isOutlier:  boolean;
  durationMs: number | null;
  distance:   number;
  saving:     boolean;
  saveError:  string | null;
  onSave:     () => void;
}) {
  const {
    mode, ai, aiFallback, showManualMarks,
    videoRef, clipUrl, releaseSec, pitchSec,
    onMarkRelease, onMarkPitch, onClearMarks, onRestart, onRetryAi,
    speedKmh, isOutlier, durationMs, distance, saving, saveError, onSave,
  } = props;

  const invertedOrder = releaseSec != null && pitchSec != null && pitchSec <= releaseSec;

  return (
    <div className="flex flex-col gap-3">
      <video
        ref={videoRef}
        src={clipUrl}
        controls
        playsInline
        className="w-full rounded-2xl border border-gray-800 bg-black aspect-[3/4] object-contain"
      />

      {/* AI status banner */}
      {mode === 'ai' && ai.kind === 'running' && (
        <AiProgress progress={ai.progress} />
      )}
      {mode === 'ai' && ai.kind === 'done' && !aiFallback && (
        <AiSuccessBanner result={ai.result} />
      )}
      {mode === 'ai' && ai.kind === 'done' && aiFallback && (
        <AiFallbackBanner result={ai.result} onRetry={onRetryAi} />
      )}
      {mode === 'ai' && ai.kind === 'error' && (
        <AiErrorBanner message={ai.message} onRetry={onRetryAi} />
      )}

      {showManualMarks && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onMarkRelease}
              className={`rounded-xl px-3 py-2.5 text-sm font-bold inline-flex items-center justify-center gap-1.5 ${
                releaseSec != null
                  ? 'bg-emerald-500/15 ring-1 ring-emerald-500/50 text-emerald-200'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-gray-950'
              }`}
            >
              <Circle size={12} fill="currentColor" />
              {releaseSec != null ? `Release ${fmtClock(releaseSec)}` : 'Mark release'}
            </button>
            <button
              type="button"
              onClick={onMarkPitch}
              className={`rounded-xl px-3 py-2.5 text-sm font-bold inline-flex items-center justify-center gap-1.5 ${
                pitchSec != null
                  ? 'bg-amber-500/15 ring-1 ring-amber-500/50 text-amber-200'
                  : 'bg-amber-500 hover:bg-amber-400 text-gray-950'
              }`}
            >
              <Circle size={12} fill="currentColor" />
              {pitchSec != null ? `Pitch ${fmtClock(pitchSec)}` : 'Mark pitch'}
            </button>
          </div>

          {invertedOrder && (
            <p className="text-xs text-rose-300 bg-rose-950/30 border border-rose-900/60 rounded-lg px-3 py-2">
              Pitch must come after release. Try again.
            </p>
          )}
        </>
      )}

      {releaseSec != null && pitchSec != null && pitchSec > releaseSec && speedKmh != null && (
        <ResultCard
          speedKmh={speedKmh}
          isOutlier={isOutlier}
          durationMs={durationMs!}
          distance={distance}
          saving={saving}
          error={saveError}
          onSave={onSave}
        />
      )}

      <div className="flex gap-2">
        {showManualMarks && (
          <button
            type="button"
            onClick={onClearMarks}
            className="flex-1 rounded-xl bg-gray-800 hover:bg-gray-700 px-3 py-2 text-xs text-gray-200 inline-flex items-center justify-center gap-1.5"
          >
            <RotateCcw size={12} /> Clear marks
          </button>
        )}
        <button
          type="button"
          onClick={onRestart}
          className="flex-1 rounded-xl bg-gray-800 hover:bg-gray-700 px-3 py-2 text-xs text-gray-200 inline-flex items-center justify-center gap-1.5"
        >
          <ArrowLeft size={12} /> New clip
        </button>
      </div>
    </div>
  );
}

function AiProgress({ progress }: { progress: number }) {
  return (
    <div className="rounded-2xl border border-sky-900/60 bg-sky-950/30 p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-sky-300" />
        <p className="text-xs font-bold uppercase tracking-wider text-sky-300">
          Analyzing video…
        </p>
        <p className="ml-auto text-[11px] text-sky-200 tabular-nums">{Math.round(progress * 100)}%</p>
      </div>
      <div className="h-1.5 rounded-full bg-sky-950 overflow-hidden">
        <div
          className="h-full bg-sky-400 transition-all"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <p className="text-[11px] text-gray-400 leading-relaxed">
        First run downloads the CV models (~10 MB) from Google&apos;s CDN. Subsequent
        clips are instant.
      </p>
    </div>
  );
}

function AiSuccessBanner({ result }: { result: AnalysisResult }) {
  return (
    <div className="rounded-2xl border border-emerald-900/60 bg-emerald-950/20 p-3 flex items-start gap-2">
      <Sparkles size={14} className="text-emerald-300 mt-0.5 shrink-0" />
      <div className="flex-1 text-[11px]">
        <p className="font-semibold text-emerald-200">
          AI detected your delivery · confidence {Math.round(result.confidence * 100)}%
        </p>
        <p className="text-gray-400 mt-0.5">
          Release {result.releaseMs != null ? `${(result.releaseMs / 1000).toFixed(2)}s` : '—'} ·
          Bounce {result.bounceMs != null ? `${(result.bounceMs / 1000).toFixed(2)}s` : '—'}
        </p>
        <p className="text-gray-500 mt-0.5">{result.diagnostic}</p>
      </div>
    </div>
  );
}

function AiFallbackBanner({ result, onRetry }: { result: AnalysisResult; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-amber-900/60 bg-amber-950/30 p-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <Sparkles size={14} className="text-amber-300 mt-0.5 shrink-0" />
        <div className="flex-1 text-[11px]">
          <p className="font-semibold text-amber-200">
            AI confidence is low · {Math.round(result.confidence * 100)}%
          </p>
          <p className="text-gray-400 mt-0.5">
            We&apos;ve pre-filled what we could spot — nudge the marks below to match
            what you see, or retry the analysis.
          </p>
          <p className="text-gray-500 mt-0.5">{result.diagnostic}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="self-start rounded-lg bg-amber-500/15 ring-1 ring-amber-500/40 px-2.5 py-1 text-[11px] font-bold text-amber-200 inline-flex items-center gap-1.5"
      >
        <RotateCcw size={11} /> Retry AI
      </button>
    </div>
  );
}

function AiErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-900/60 bg-rose-950/30 p-3 flex flex-col gap-2">
      <p className="text-[11px] font-semibold text-rose-200">
        AI couldn&apos;t run · falling back to manual marks
      </p>
      <p className="text-[11px] text-gray-400 truncate">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="self-start rounded-lg bg-rose-500/15 ring-1 ring-rose-500/40 px-2.5 py-1 text-[11px] font-bold text-rose-200 inline-flex items-center gap-1.5"
      >
        <RotateCcw size={11} /> Retry
      </button>
    </div>
  );
}

function ResultCard({
  speedKmh, isOutlier, durationMs, distance, saving, error, onSave,
}: {
  speedKmh: number; isOutlier: boolean; durationMs: number; distance: number;
  saving: boolean; error: string | null; onSave: () => void;
}) {
  if (isOutlier) {
    return (
      <div className="rounded-2xl border border-rose-900/60 bg-rose-950/30 p-5 flex flex-col items-center gap-2 text-center">
        <p className="text-[11px] font-bold uppercase tracking-wider text-rose-400">Reading looks off</p>
        <p className="text-3xl font-extrabold text-rose-200 tabular-nums">{speedKmh.toFixed(1)} km/h</p>
        <p className="text-xs text-gray-400 max-w-[32ch] leading-relaxed">
          That&apos;s outside 30–140 km/h. Check pitch-length and your marks, then try again.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-emerald-900/60 bg-emerald-950/30 p-5 flex flex-col items-center gap-2 text-center">
      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Delivery speed</p>
      <p className="text-5xl font-extrabold text-white tabular-nums leading-none">
        {speedKmh.toFixed(1)}
        <span className="text-xl text-emerald-300 font-bold ml-2">km/h</span>
      </p>
      <p className="text-[11px] text-gray-500">{distance.toFixed(2)} m · {durationMs} ms</p>
      {error && (
        <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-900/60 rounded-lg px-3 py-2 max-w-full">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="mt-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2.5 text-sm font-bold text-gray-950 disabled:opacity-50 w-full"
      >
        {saving ? 'Saving…' : 'Save delivery'}
      </button>
    </div>
  );
}
