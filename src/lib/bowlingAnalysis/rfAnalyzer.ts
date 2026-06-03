'use client';

import type { AnalysisResult, AnalyzeOptions, FrameSample } from './analyzer';

/**
 * Roboflow Universe / Hosted Inference path for the Bowling Analyzer.
 *
 * Same pipeline as hfAnalyzer.ts:
 *   * Sample frames at ~5 fps of video time
 *   * Send each as JPEG to /api/bowling/rf-detect (server proxies to Roboflow)
 *   * Pick the highest-scoring ball-like detection per frame
 *   * Detect release from the first confident ball-visible frame
 *   * Detect bounce from the local Y-max of the post-release trajectory
 *
 * Why this exists alongside the HF path:
 *   * HF free serverless inference only hosts a narrow subset of object
 *     detection models — no YOLOv8 ports, no cricket-specific community
 *     models. Roboflow Universe hosts thousands of community-trained
 *     models, including ones purpose-built for cricket-ball detection.
 *   * Free tier: ~1000 inferences/month, ~30/min. A 3-second clip at our
 *     200ms sampling = 15 inferences → ~60 clips/month free. Plenty for
 *     dogfooding and amateur use.
 */

const SAMPLE_INTERVAL_MS = 200;
const FRAME_WIDTH = 416;     // Slightly larger than HF — Roboflow YOLO models
                             // tolerate this without latency penalty
const JPEG_QUALITY = 0.7;

// Roboflow models for ball detection sometimes label the ball as different
// things depending on training data. Accept broadly — false positives in
// gully cricket are unlikely (no frisbees / basketballs in the frame).
const BALL_LABELS = ['ball', 'sports ball', 'sports_ball', 'cricket ball', 'cricket-ball', 'cricketball'];

interface RfDetection {
  label: string;
  score: number;
  box: { x: number; y: number; w: number; h: number };
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise(resolve => {
    const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = t;
  });
}

function captureFrameJpeg(video: HTMLVideoElement): string {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return '';
  const scale = FRAME_WIDTH / vw;
  const w = FRAME_WIDTH;
  const h = Math.round(vh * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

async function detectInFrame(imageDataUrl: string, model: string): Promise<RfDetection[]> {
  const r = await fetch('/api/bowling/rf-detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl, model }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || `RF detect ${r.status}`);
  }
  const j = await r.json();
  return Array.isArray(j.detections) ? j.detections : [];
}

function pickBall(detections: RfDetection[]): FrameSample['ball'] {
  let best: RfDetection | null = null;
  for (const d of detections) {
    const lbl = (d.label ?? '').toLowerCase();
    if (!BALL_LABELS.some(t => lbl.includes(t))) continue;
    if (!best || d.score > best.score) best = d;
  }
  if (!best) return null;
  return {
    x: best.box.x + best.box.w / 2,
    y: best.box.y + best.box.h / 2,
    w: best.box.w,
    h: best.box.h,
    score: best.score,
  };
}

function detectReleaseFromBall(samples: FrameSample[]): { timeMs: number | null; confidence: number } {
  const withBall = samples.filter(s => s.ball != null);
  if (withBall.length === 0) return { timeMs: null, confidence: 0 };
  // Pick the FIRST plausible ball detection — but bias the picker toward
  // higher-scoring hits when several early frames have detections. Threshold
  // dropped from 0.30 to 0.20 to match the route's lowered confidence filter.
  const first = withBall.find(s => (s.ball?.score ?? 0) >= 0.20) ?? withBall[0];
  const conf = Math.min(1, (first.ball?.score ?? 0));
  return { timeMs: first.timeMs, confidence: conf };
}

function detectBounce(
  samples: FrameSample[],
  releaseMs: number | null,
): { timeMs: number | null; confidence: number } {
  if (releaseMs == null) return { timeMs: null, confidence: 0 };
  const post = samples
    .filter(s => s.timeMs > releaseMs && s.ball != null)
    .map(s => ({ timeMs: s.timeMs, y: s.ball!.y, score: s.ball!.score }));
  if (post.length < 2) return { timeMs: null, confidence: 0 };

  let peakIdx = -1;
  let peakY   = -Infinity;
  for (let i = 1; i < post.length - 1; i++) {
    if (post[i].y > post[i - 1].y && post[i].y > post[i + 1].y && post[i].y > peakY) {
      peakIdx = i;
      peakY   = post[i].y;
    }
  }
  if (peakIdx === -1) {
    const lowest = post.reduce((a, b) => b.y > a.y ? b : a);
    return { timeMs: lowest.timeMs, confidence: 0.25 };
  }
  const peakScore = post[peakIdx].score;
  const coverage  = Math.min(1, post.length / 6);
  return { timeMs: post[peakIdx].timeMs, confidence: Math.min(1, peakScore * coverage) };
}

export interface RfAnalyzeOptions extends AnalyzeOptions {
  /** Roboflow model path: "workspace/project/version" — find on Roboflow Universe. */
  model: string;
}

export async function analyzeDeliveryWithRoboflow(
  video: HTMLVideoElement,
  opts: RfAnalyzeOptions,
): Promise<AnalysisResult> {
  const { distanceM, sampleIntervalMs = SAMPLE_INTERVAL_MS, onProgress, model } = opts;
  if (!model) {
    return emptyResult('Roboflow model path is required');
  }

  const durationMs = (video.duration ?? 0) * 1000;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return emptyResult('Video has no duration');
  }

  const samples: FrameSample[] = [];
  const numFrames = Math.ceil(durationMs / sampleIntervalMs);
  let i = 0;

  for (let t = 0; t < durationMs; t += sampleIntervalMs, i++) {
    await seekTo(video, t / 1000);
    const dataUrl = captureFrameJpeg(video);
    let detections: RfDetection[] = [];
    try {
      detections = await detectInFrame(dataUrl, model);
    } catch (e) {
      console.warn('[rfAnalyzer] frame', i, 'detect failed:', e);
    }
    samples.push({
      timeMs: t,
      wrist:  null,
      ball:   pickBall(detections),
    });
    onProgress?.(Math.min(1, (i + 1) / numFrames));
  }
  onProgress?.(1);

  const release = detectReleaseFromBall(samples);
  const bounce  = detectBounce(samples, release.timeMs);

  let speedKmh: number | null = null;
  if (release.timeMs != null && bounce.timeMs != null && bounce.timeMs > release.timeMs) {
    const seconds = (bounce.timeMs - release.timeMs) / 1000;
    speedKmh = Math.round((distanceM / seconds) * 3.6 * 10) / 10;
  }

  const confidence = Math.sqrt(release.confidence * bounce.confidence);
  const withBall = samples.filter(s => s.ball).length;

  return {
    releaseMs:  release.timeMs,
    bounceMs:   bounce.timeMs,
    speedKmh,
    confidence,
    frames: samples,
    diagnostic: `RF ${model} · ${samples.length} frames · ball ${withBall}/${samples.length} · release conf ${release.confidence.toFixed(2)} · bounce conf ${bounce.confidence.toFixed(2)}`,
  };
}

function emptyResult(reason: string): AnalysisResult {
  return {
    releaseMs: null,
    bounceMs:  null,
    speedKmh:  null,
    confidence: 0,
    frames: [],
    diagnostic: `Roboflow analyzer aborted: ${reason}`,
  };
}
