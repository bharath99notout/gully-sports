'use client';

import type { AnalysisResult, AnalyzeOptions, FrameSample } from './analyzer';

/**
 * Experimental Hugging Face Inference API path for the Bowling Analyzer.
 *
 * Differences from the MediaPipe analyzer:
 *   * Pure ball-detection — no pose. Release is inferred from the first
 *     frame the ball is clearly separable from the bowler's hand (using a
 *     simple "ball detected with high enough score" heuristic).
 *   * Sequential per-frame HTTP calls (sequential to stay under the free
 *     tier's ~30 RPM). Slower than in-browser MediaPipe — expect 30-60s
 *     for a 15-frame sample on free tier.
 *   * Frames are downsampled + JPEG-q60 before upload to keep each request
 *     small (~30-80 KB) and respect Next's body-size limits.
 *
 * For testing / dogfooding only. MediaPipe remains the default.
 */

// Sparser sampling than MediaPipe — every 200ms instead of 50ms. HF round-
// trip dominates the cost, so we trade temporal resolution for analysis
// time. A 3-second clip becomes ~15 frames = ~30-60s analysis on free tier.
const SAMPLE_INTERVAL_MS = 200;
const FRAME_WIDTH = 384;   // px — preserves aspect, keeps JPEG small
const JPEG_QUALITY = 0.7;

// Generic "sports ball" tokens we accept across COCO-trained models.
// Cricket-specific community models may use different labels (e.g.
// "cricket-ball", "ball", "Ball") — we match liberally.
const BALL_LABELS = ['sports ball', 'sports_ball', 'ball', 'cricket ball', 'cricket-ball'];

interface HfDetection {
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

async function detectInFrame(
  imageDataUrl: string,
  model: string,
): Promise<HfDetection[]> {
  const r = await fetch('/api/bowling/hf-detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl, model }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || `HF detect ${r.status}`);
  }
  const j = await r.json();
  return Array.isArray(j.detections) ? j.detections : [];
}

function pickBall(detections: HfDetection[]): FrameSample['ball'] {
  // Take the highest-scoring ball-like detection.
  let best: HfDetection | null = null;
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

/**
 * Release detection without pose: first frame the ball is detected with a
 * decent score. Less accurate than the MediaPipe pose-based path, but it
 * avoids a dependency on a second model and second API.
 */
function detectReleaseFromBall(samples: FrameSample[]): { timeMs: number | null; confidence: number } {
  const withBall = samples.filter(s => s.ball != null);
  if (withBall.length === 0) return { timeMs: null, confidence: 0 };
  const first = withBall.find(s => (s.ball?.score ?? 0) >= 0.30) ?? withBall[0];
  // Confidence: scaled by detection score, capped 0-1.
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

  // Local Y maximum (lowest visible point — screen y grows downward).
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
    return { timeMs: lowest.timeMs, confidence: 0.2 };
  }

  const peakScore = post[peakIdx].score;
  const coverage  = Math.min(1, post.length / 6);
  return { timeMs: post[peakIdx].timeMs, confidence: Math.min(1, peakScore * coverage) };
}

export interface HfAnalyzeOptions extends AnalyzeOptions {
  /** Hugging Face model id. Defaults to facebook/detr-resnet-50. */
  model?: string;
}

export async function analyzeDeliveryWithHF(
  video: HTMLVideoElement,
  opts: HfAnalyzeOptions,
): Promise<AnalysisResult> {
  const { distanceM, sampleIntervalMs = SAMPLE_INTERVAL_MS, onProgress, model } = opts;
  const modelId = model || 'facebook/detr-resnet-50';

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
    let detections: HfDetection[] = [];
    try {
      detections = await detectInFrame(dataUrl, modelId);
    } catch (e) {
      // One failed frame doesn't kill the whole analysis. Push a sample
      // with no ball, surface the error in diagnostic.
      console.warn('[hfAnalyzer] frame', i, 'detect failed:', e);
    }
    samples.push({
      timeMs: t,
      wrist:  null, // HF path doesn't run pose
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
    diagnostic: `HF ${modelId} · ${samples.length} frames · ball ${withBall}/${samples.length} · release conf ${release.confidence.toFixed(2)} · bounce conf ${bounce.confidence.toFixed(2)}`,
  };
}

function emptyResult(reason: string): AnalysisResult {
  return {
    releaseMs: null,
    bounceMs:  null,
    speedKmh:  null,
    confidence: 0,
    frames: [],
    diagnostic: `HF analyzer aborted: ${reason}`,
  };
}
