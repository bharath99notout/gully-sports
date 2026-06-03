'use client';

import type { AnalysisResult, AnalyzeOptions } from './analyzer';

/**
 * Gemini Vision path for the Bowling Analyzer.
 *
 * Distinct from the HF/Roboflow per-frame analyzers:
 *   * Single HTTP call carrying the WHOLE video, not 15 calls per clip.
 *   * Gemini watches the clip end-to-end and returns the release + bounce
 *     timestamps directly — no per-frame ball tracking, no Y-trajectory
 *     math on our side.
 *   * Latency is dominated by Gemini's video understanding (~5-20s per
 *     clip), not by network round-trips like the per-frame paths.
 *
 * The video itself is sent as base64 inline (capped to ~18 MB on the
 * server side). For longer clips we'd need to upload via Gemini's Files
 * API first — that's a follow-up if anyone hits the cap.
 */

const READ_AS_DATAURL_TIMEOUT_MS = 8000;

interface GeminiRouteResponse {
  releaseMs:  number | null;
  bounceMs:   number | null;
  confidence: number;
  notes:      string | null;
  model:      string;
}

export interface GeminiAnalyzeOptions extends AnalyzeOptions {
  /** The blob we recorded or the user uploaded; we ship it to Gemini. */
  clip: Blob;
  /** Optional model override; default is gemini-2.5-flash. */
  model?: string;
}

function blobToBase64(blob: Blob): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const timer = setTimeout(() => reject(new Error('FileReader timed out')), READ_AS_DATAURL_TIMEOUT_MS);
    reader.onerror = () => { clearTimeout(timer); reject(new Error('FileReader failed to read clip')); };
    reader.onloadend = () => {
      clearTimeout(timer);
      const result = reader.result as string | null;
      if (!result) return reject(new Error('FileReader returned empty result'));
      const comma = result.indexOf(',');
      if (comma < 0) return reject(new Error('Not a data URL'));
      const header = result.slice(0, comma); // "data:video/mp4;base64"
      const mimeMatch = header.match(/^data:([^;]+);base64$/);
      const mime = mimeMatch?.[1] ?? blob.type ?? 'video/mp4';
      resolve({ base64: result.slice(comma + 1), mime });
    };
    reader.readAsDataURL(blob);
  });
}

export async function analyzeDeliveryWithGemini(
  _video: HTMLVideoElement, // unused — we send the blob directly, but kept for analyzer interface parity
  opts: GeminiAnalyzeOptions,
): Promise<AnalysisResult> {
  const { distanceM, clip, model, onProgress } = opts;
  if (!clip || clip.size === 0) return emptyResult('No video clip provided');

  // We have one HTTP call. Fake progress as: 0.05 (encoding) → 0.20 (sent)
  // → 0.95 while waiting → 1.0 on response. Keeps the spinner from looking
  // frozen during the multi-second Gemini call.
  onProgress?.(0.05);

  let payload: { base64: string; mime: string };
  try {
    payload = await blobToBase64(clip);
  } catch (e) {
    return emptyResult(e instanceof Error ? e.message : 'Could not encode clip');
  }
  onProgress?.(0.20);

  // Tick the bar slowly while we wait so the UI doesn't appear stuck.
  let p = 0.20;
  const ticker = setInterval(() => {
    p = Math.min(0.93, p + 0.02);
    onProgress?.(p);
  }, 700);

  let response: GeminiRouteResponse;
  try {
    const r = await fetch('/api/bowling/gemini-detect', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoBase64: payload.base64,
        videoMime:   payload.mime,
        distanceM,
        model,
      }),
    });
    clearInterval(ticker);
    onProgress?.(1);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || `Gemini detect ${r.status}`);
    }
    response = await r.json();
  } catch (e) {
    clearInterval(ticker);
    onProgress?.(1);
    return emptyResult(e instanceof Error ? e.message : 'Gemini call failed');
  }

  let speedKmh: number | null = null;
  if (response.releaseMs != null && response.bounceMs != null && response.bounceMs > response.releaseMs) {
    const seconds = (response.bounceMs - response.releaseMs) / 1000;
    speedKmh = Math.round((distanceM / seconds) * 3.6 * 10) / 10;
  }

  return {
    releaseMs:  response.releaseMs,
    bounceMs:   response.bounceMs,
    speedKmh,
    confidence: response.confidence,
    frames: [], // Gemini doesn't expose per-frame data; the diagnostic carries its observation.
    diagnostic: `Gemini ${response.model}${response.notes ? ' · ' + response.notes : ''}`,
  };
}

function emptyResult(reason: string): AnalysisResult {
  return {
    releaseMs:  null,
    bounceMs:   null,
    speedKmh:   null,
    confidence: 0,
    frames:     [],
    diagnostic: `Gemini analyzer aborted: ${reason}`,
  };
}
