'use client';

import type {
  FilesetResolver as FilesetResolverT,
  PoseLandmarker as PoseLandmarkerT,
  ObjectDetector as ObjectDetectorT,
  PoseLandmarkerResult,
  ObjectDetectorResult,
} from '@mediapipe/tasks-vision';

// ── Model URLs ───────────────────────────────────────────────────────────────
// MediaPipe hosts these on Google Cloud Storage with permissive CORS so we
// can load them straight from the browser. Lite variants chosen for mid-range
// Android — accuracy is "good enough" for amateur bowling clips.
const POSE_MODEL_URL  = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const OBJ_MODEL_URL   = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite';
const WASM_BASE       = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';

// ── Public types ─────────────────────────────────────────────────────────────

export interface FrameSample {
  timeMs: number;
  /** Wrist (right by default; left for southpaws) screen position in pixels. */
  wrist: { x: number; y: number; visibility: number } | null;
  /** Detected ball bounding box (sports ball class). */
  ball: { x: number; y: number; w: number; h: number; score: number } | null;
}

export interface AnalysisResult {
  /** Estimated release timestamp in ms relative to clip start. */
  releaseMs: number | null;
  /** Estimated bounce timestamp in ms relative to clip start. */
  bounceMs: number | null;
  /** Estimated speed (km/h) if both events found and distance supplied. */
  speedKmh: number | null;
  /** 0–1 confidence band derived from pose visibility + ball-track length. */
  confidence: number;
  /** Sampled frames — useful for debugging + manual fine-tune UI. */
  frames: FrameSample[];
  /** Human-readable note about what worked / what didn't. */
  diagnostic: string;
}

export interface AnalyzeOptions {
  /** Pitch length in meters (used for the speed calculation). */
  distanceM: number;
  /** How often to sample the clip — lower = faster but coarser. */
  sampleIntervalMs?: number;
  /** Progress callback (0–1). */
  onProgress?: (fraction: number) => void;
}

// ── Detector singleton ───────────────────────────────────────────────────────
// MediaPipe init is expensive (~3-5s first time: WASM + 2 models). Cache
// the detectors module-wide so a user who runs analyze() twice in a session
// only pays the cost once.

let cached: {
  pose: PoseLandmarkerT;
  obj:  ObjectDetectorT;
} | null = null;

async function getDetectors(): Promise<{ pose: PoseLandmarkerT; obj: ObjectDetectorT }> {
  if (cached) return cached;

  const mp = await import('@mediapipe/tasks-vision');
  const { FilesetResolver, PoseLandmarker, ObjectDetector } = mp as unknown as {
    FilesetResolver: typeof FilesetResolverT;
    PoseLandmarker:  typeof PoseLandmarkerT;
    ObjectDetector:  typeof ObjectDetectorT;
  };

  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);

  const [pose, obj] = await Promise.all([
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL_URL },
      runningMode: 'VIDEO',
      numPoses: 1,
    }),
    ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: OBJ_MODEL_URL },
      runningMode: 'VIDEO',
      scoreThreshold: 0.20,
      categoryAllowlist: ['sports ball'],
      maxResults: 3,
    }),
  ]);

  cached = { pose, obj };
  return cached;
}

// ── Frame iteration ──────────────────────────────────────────────────────────

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise(resolve => {
    const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = t;
  });
}

/**
 * Walk the clip from start to end, sampling at sampleIntervalMs spacing.
 * For each sample we run pose + object detection and collect a FrameSample.
 */
async function sampleFrames(
  video: HTMLVideoElement,
  pose: PoseLandmarkerT,
  obj:  ObjectDetectorT,
  intervalMs: number,
  onProgress?: (fraction: number) => void,
): Promise<FrameSample[]> {
  const durationMs = (video.duration ?? 0) * 1000;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return [];

  const samples: FrameSample[] = [];
  const startedAt = performance.now();

  for (let t = 0; t < durationMs; t += intervalMs) {
    await seekTo(video, t / 1000);

    const ts = startedAt + t; // monotonically increasing timestamp MediaPipe wants
    let poseRes: PoseLandmarkerResult | null = null;
    let objRes:  ObjectDetectorResult  | null = null;
    try { poseRes = pose.detectForVideo(video, ts); } catch { /* one bad frame is OK */ }
    try { objRes  = obj.detectForVideo(video,  ts); } catch { /* same */ }

    samples.push({
      timeMs: t,
      wrist:  pickWrist(poseRes, video.videoWidth, video.videoHeight),
      ball:   pickBall(objRes),
    });

    onProgress?.(Math.min(1, t / durationMs));
  }
  onProgress?.(1);
  return samples;
}

function pickWrist(
  res: PoseLandmarkerResult | null,
  vw: number, vh: number,
): FrameSample['wrist'] {
  const pose = res?.landmarks?.[0];
  if (!pose || pose.length === 0) return null;
  // MediaPipe Pose landmark indices: 15 = left wrist, 16 = right wrist.
  // We pick whichever has higher visibility — handles both left- and right-
  // arm bowlers without asking the user.
  const lw = pose[15];
  const rw = pose[16];
  const w  = (rw?.visibility ?? 0) >= (lw?.visibility ?? 0) ? rw : lw;
  if (!w || (w.visibility ?? 0) < 0.4) return null;
  return { x: w.x * vw, y: w.y * vh, visibility: w.visibility ?? 0 };
}

function pickBall(res: ObjectDetectorResult | null): FrameSample['ball'] {
  const det = res?.detections?.[0];
  if (!det) return null;
  const box = det.boundingBox;
  const cat = det.categories?.[0];
  if (!box || !cat) return null;
  return {
    x: box.originX + box.width / 2,
    y: box.originY + box.height / 2,
    w: box.width,
    h: box.height,
    score: cat.score ?? 0,
  };
}

// ── Event detection ──────────────────────────────────────────────────────────

/**
 * Release frame = frame with maximum forward wrist velocity. Heuristic:
 *   * compute |Δwrist| between each consecutive sample
 *   * pick the frame whose velocity is the global max
 *   * require at least 4 wrist-visible frames around it for it to count
 *
 * Returns the timeMs of the release frame, plus a 0–1 confidence based on
 * how sharp the velocity peak is vs the rest of the trajectory.
 */
function detectRelease(samples: FrameSample[]): { timeMs: number | null; confidence: number } {
  const withWrist = samples.filter(s => s.wrist != null);
  if (withWrist.length < 4) return { timeMs: null, confidence: 0 };

  const velocities: Array<{ timeMs: number; v: number }> = [];
  for (let i = 1; i < withWrist.length; i++) {
    const a = withWrist[i - 1].wrist!;
    const b = withWrist[i].wrist!;
    const dt = (withWrist[i].timeMs - withWrist[i - 1].timeMs) || 1;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    velocities.push({ timeMs: withWrist[i].timeMs, v: dist / dt });
  }

  let peak = velocities[0];
  let sum = 0;
  for (const v of velocities) {
    if (v.v > peak.v) peak = v;
    sum += v.v;
  }
  const mean = sum / velocities.length;
  // Confidence = how much the peak stands out above the mean. Capped 0–1.
  const conf = Math.max(0, Math.min(1, (peak.v - mean) / Math.max(mean, 1e-3)));
  return { timeMs: peak.timeMs, confidence: conf };
}

/**
 * Bounce frame = frame after release where the ball's Y position reaches a
 * local maximum (i.e. lowest point on screen — screen y grows downward) AND
 * the Y velocity flips from positive to negative.
 *
 * Falls back to null + 0 confidence if fewer than 3 ball-visible frames in
 * the post-release window — gully cricket frequently loses the ball mid-air.
 */
function detectBounce(
  samples: FrameSample[],
  releaseMs: number | null,
): { timeMs: number | null; confidence: number } {
  if (releaseMs == null) return { timeMs: null, confidence: 0 };

  const post = samples
    .filter(s => s.timeMs > releaseMs && s.ball != null)
    .map(s => ({ timeMs: s.timeMs, y: s.ball!.y, score: s.ball!.score }));

  if (post.length < 3) return { timeMs: null, confidence: 0 };

  // Find local maximum of y (ball at lowest visible point)
  let peakIdx = -1;
  let peakY   = -Infinity;
  for (let i = 1; i < post.length - 1; i++) {
    if (post[i].y > post[i - 1].y && post[i].y > post[i + 1].y && post[i].y > peakY) {
      peakIdx = i;
      peakY   = post[i].y;
    }
  }

  if (peakIdx === -1) {
    // No clean local max — fall back to the absolute lowest-on-screen frame,
    // but knock down confidence to reflect the guess.
    const lowest = post.reduce((a, b) => b.y > a.y ? b : a);
    return { timeMs: lowest.timeMs, confidence: 0.25 };
  }

  // Confidence: scaled by detection score + how many ball-visible frames we
  // had to work with. More observations = more trustworthy.
  const peakScore = post[peakIdx].score;
  const coverage  = Math.min(1, post.length / 8);
  return { timeMs: post[peakIdx].timeMs, confidence: Math.min(1, peakScore * coverage) };
}

// ── Public entry point ──────────────────────────────────────────────────────

export async function analyzeDelivery(
  video: HTMLVideoElement,
  opts: AnalyzeOptions,
): Promise<AnalysisResult> {
  const { distanceM, sampleIntervalMs = 50, onProgress } = opts;

  const { pose, obj } = await getDetectors();
  const frames = await sampleFrames(video, pose, obj, sampleIntervalMs, onProgress);

  const release = detectRelease(frames);
  const bounce  = detectBounce(frames, release.timeMs);

  let speedKmh: number | null = null;
  if (release.timeMs != null && bounce.timeMs != null && bounce.timeMs > release.timeMs) {
    const seconds = (bounce.timeMs - release.timeMs) / 1000;
    speedKmh = Math.round((distanceM / seconds) * 3.6 * 10) / 10;
  }

  // Overall confidence = geometric mean of release + bounce (penalises a
  // strong release with a weak bounce more than a simple average would).
  const confidence = Math.sqrt(release.confidence * bounce.confidence);

  const diagnostic = buildDiagnostic({
    framesAnalyzed: frames.length,
    withWrist: frames.filter(f => f.wrist).length,
    withBall:  frames.filter(f => f.ball).length,
    release, bounce,
  });

  return {
    releaseMs: release.timeMs,
    bounceMs:  bounce.timeMs,
    speedKmh,
    confidence,
    frames,
    diagnostic,
  };
}

function buildDiagnostic(s: {
  framesAnalyzed: number;
  withWrist: number;
  withBall: number;
  release: { timeMs: number | null; confidence: number };
  bounce:  { timeMs: number | null; confidence: number };
}): string {
  const parts: string[] = [];
  parts.push(`${s.framesAnalyzed} frames sampled`);
  parts.push(`pose ${s.withWrist}/${s.framesAnalyzed}`);
  parts.push(`ball ${s.withBall}/${s.framesAnalyzed}`);
  parts.push(`release conf ${s.release.confidence.toFixed(2)}`);
  parts.push(`bounce conf ${s.bounce.confidence.toFixed(2)}`);
  return parts.join(' · ');
}
