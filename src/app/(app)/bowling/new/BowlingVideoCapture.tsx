'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Video, Upload, Circle, Square, RotateCcw, ArrowLeft } from 'lucide-react';
import { createBowlingDelivery } from '@/app/actions/bowlingDeliveries';

/**
 * Video-based capture for the Bowling Analyzer.
 *
 * Pipeline:
 *   1. SOURCE  — user records via getUserMedia/MediaRecorder OR uploads a
 *      pre-recorded clip (e.g. their phone's native slo-mo from gallery).
 *   2. SCRUB   — clip plays in an inline <video> the user can scrub.
 *   3. MARK    — two buttons capture `videoEl.currentTime` at release and
 *      pitch. Frame-precise — no human reaction-time error like a live tap.
 *   4. COMPUTE — speed = distance / (pitch − release).
 *   5. SAVE    — persists the marks + speed to bowling_deliveries via the
 *      server action.
 *
 * Action analysis (arm angle, side-on/front-on) needs MediaPipe Pose on the
 * release frame. Scaffolded but stubbed in this commit — see TODO below.
 */

type Phase = 'source' | 'recording' | 'review';

const PITCH_PRESETS = [
  { label: 'Full pitch', meters: 20.12 },
  { label: 'Half pitch', meters: 11.0  },
  { label: 'Net / short', meters: 14.0 },
];

function fmtClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0.00s';
  return `${seconds.toFixed(2)}s`;
}

export default function BowlingVideoCapture() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('source');
  const [distance, setDistance] = useState<number>(20.12);

  // Live recording
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef  = useRef<Blob[]>([]);
  const [recError, setRecError] = useState<string | null>(null);

  // Review
  const reviewRef = useRef<HTMLVideoElement | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [releaseSec, setReleaseSec] = useState<number | null>(null);
  const [pitchSec,   setPitchSec]   = useState<number | null>(null);

  // Save
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── lifecycle ────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      // Free the camera stream + the object URL if we created one.
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (clipUrl) URL.revokeObjectURL(clipUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── recording ────────────────────────────────────────────────────────────
  async function startRecording() {
    setRecError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // back camera on phone
          frameRate: { ideal: 60 },             // ask for high FPS where available
        },
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
        // tracks are stopped below once we transition out of recording
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

  // ── upload ───────────────────────────────────────────────────────────────
  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (clipUrl) URL.revokeObjectURL(clipUrl);
    const url = URL.createObjectURL(f);
    setClipUrl(url);
    setReleaseSec(null);
    setPitchSec(null);
    setPhase('review');
  }

  // ── marks ────────────────────────────────────────────────────────────────
  function markRelease() {
    const t = reviewRef.current?.currentTime ?? 0;
    setReleaseSec(t);
  }
  function markPitch() {
    const t = reviewRef.current?.currentTime ?? 0;
    setPitchSec(t);
  }
  function clearMarks() {
    setReleaseSec(null);
    setPitchSec(null);
  }

  // ── compute ──────────────────────────────────────────────────────────────
  const durationMs = (releaseSec != null && pitchSec != null && pitchSec > releaseSec)
    ? Math.round((pitchSec - releaseSec) * 1000)
    : null;
  const speedKmh = durationMs != null
    ? Math.round((distance / (durationMs / 1000)) * 3.6 * 10) / 10
    : null;
  const isOutlier = speedKmh != null && (speedKmh < 30 || speedKmh > 140);

  // ── save ─────────────────────────────────────────────────────────────────
  async function save() {
    if (durationMs == null || releaseSec == null || pitchSec == null) return;
    setSaving(true);
    setSaveError(null);
    const r = await createBowlingDelivery({
      durationMs,
      distanceM:    distance,
      recordedVia:  'video_mark',
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
    setPhase('source');
  }

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <DistancePicker value={distance} onChange={setDistance} disabled={phase === 'recording'} />

      {phase === 'source' && (
        <SourcePicker onRecord={startRecording} onPick={onPickFile} error={recError} />
      )}

      {phase === 'recording' && (
        <RecordingView previewRef={previewRef} onStop={stopRecording} />
      )}

      {phase === 'review' && clipUrl && (
        <ReviewView
          videoRef={reviewRef}
          clipUrl={clipUrl}
          releaseSec={releaseSec}
          pitchSec={pitchSec}
          onMarkRelease={markRelease}
          onMarkPitch={markPitch}
          onClearMarks={clearMarks}
          onRestart={resetAll}
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
        How it works · record or upload a clip of one delivery, then scrub to the moment the ball
        leaves the bowler&apos;s hand and tap <span className="text-emerald-400 font-semibold">Release</span>.
        Scrub to where it pitches and tap <span className="text-amber-400 font-semibold">Pitch</span>.
        We read the timestamps off the video file — no reaction-time error.
      </p>
    </div>
  );
}

// ── subcomponents ──────────────────────────────────────────────────────────

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
        <video
          ref={previewRef}
          playsInline
          muted
          className="w-full h-full object-cover"
        />
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

function ReviewView({
  videoRef, clipUrl, releaseSec, pitchSec,
  onMarkRelease, onMarkPitch, onClearMarks, onRestart,
  speedKmh, isOutlier, durationMs, distance,
  saving, saveError, onSave,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  clipUrl: string;
  releaseSec: number | null;
  pitchSec:   number | null;
  onMarkRelease: () => void;
  onMarkPitch:   () => void;
  onClearMarks:  () => void;
  onRestart:     () => void;
  speedKmh:   number | null;
  isOutlier:  boolean;
  durationMs: number | null;
  distance:   number;
  saving:     boolean;
  saveError:  string | null;
  onSave:     () => void;
}) {
  const bothSet = releaseSec != null && pitchSec != null && pitchSec > releaseSec;
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

      {bothSet && speedKmh != null && (
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
        <button
          type="button"
          onClick={onClearMarks}
          className="flex-1 rounded-xl bg-gray-800 hover:bg-gray-700 px-3 py-2 text-xs text-gray-200 inline-flex items-center justify-center gap-1.5"
        >
          <RotateCcw size={12} /> Clear marks
        </button>
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

function ResultCard({
  speedKmh, isOutlier, durationMs, distance, saving, error, onSave,
}: {
  speedKmh: number; isOutlier: boolean; durationMs: number; distance: number;
  saving: boolean; error: string | null; onSave: () => void;
}) {
  if (isOutlier) {
    return (
      <div className="rounded-2xl border border-rose-900/60 bg-rose-950/30 p-5 flex flex-col items-center gap-2 text-center">
        <p className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
          Reading looks off
        </p>
        <p className="text-3xl font-extrabold text-rose-200 tabular-nums">
          {speedKmh.toFixed(1)} km/h
        </p>
        <p className="text-xs text-gray-400 max-w-[32ch] leading-relaxed">
          That&apos;s outside 30–140 km/h. Check your pitch-length setting and your marks, then try again.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-emerald-900/60 bg-emerald-950/30 p-5 flex flex-col items-center gap-2 text-center">
      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
        Delivery speed
      </p>
      <p className="text-5xl font-extrabold text-white tabular-nums leading-none">
        {speedKmh.toFixed(1)}
        <span className="text-xl text-emerald-300 font-bold ml-2">km/h</span>
      </p>
      <p className="text-[11px] text-gray-500">
        {distance.toFixed(2)} m · {durationMs} ms
      </p>
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
