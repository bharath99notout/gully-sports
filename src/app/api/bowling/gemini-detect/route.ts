import { NextResponse } from 'next/server';

/**
 * Proxy to Google's Gemini Vision API for the Bowling Analyzer.
 *
 * Why this engine exists (after HF/Roboflow disappointed):
 *   * Free-tier object-detection models (DETR, community YOLOs) detect
 *     cricket balls poorly on amateur gully footage — 0-3% frame coverage.
 *   * Gemini is a multimodal LLM that watches the entire clip and reasons
 *     about events — release frame, bounce frame, "did the ball go off-
 *     screen", etc. One API call per video instead of N per-frame calls.
 *
 * Flow:
 *   1. Client uploads the video as base64 with the analysis distance + the
 *      preferred Gemini model id.
 *   2. We forward to Gemini's generateContent endpoint with a tight prompt
 *      asking for release/bounce timestamps as JSON.
 *   3. We parse Gemini's JSON, compute speed, return AnalysisResult shape.
 *
 * Caveats:
 *   * Free tier: ~15 RPM / 1500 daily for gemini-2.5-flash.
 *   * LLM timings can drift by ±0.1s; for amateur cricket that's acceptable
 *     (a 50ms timing error at 20m = ~2 km/h drift).
 *   * Inline uploads cap at ~20 MB. For larger clips we'd need the Files
 *     API — V1 stays inline since cricket clips are typically 5-15 MB.
 */

const DEFAULT_MODEL = 'gemini-2.5-flash';
const MAX_INLINE_BYTES = 18 * 1024 * 1024; // Stay under Gemini's ~20MB inline limit.

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> };
}
interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { message?: string };
}

interface AnalysisJson {
  release_seconds?: number | null;
  bounce_seconds?:  number | null;
  confidence?:      number;
  notes?:           string;
}

function buildPrompt(distanceM: number): string {
  return [
    'You are analyzing a cricket bowling delivery video to estimate the ball\'s speed.',
    '',
    'Watch the entire clip and identify these two events with timestamps in seconds (use the video\'s own timeline):',
    '',
    '1. release_seconds — the precise moment the ball leaves the bowler\'s hand at the end of the bowling arm swing.',
    '2. bounce_seconds  — the precise moment the ball first contacts the pitch surface after release.',
    '',
    `The pitch length being measured is ${distanceM.toFixed(2)} m. Speed will be computed from your timestamps.`,
    '',
    'Aim for precision to the nearest 0.05 s. If a slow-motion playback makes events look longer than real time, still report video-timeline seconds — the client will divide by the slo-mo factor.',
    '',
    'Respond ONLY with a single JSON object, no surrounding markdown, no code fence, no commentary:',
    '{',
    '  "release_seconds": <number or null>,',
    '  "bounce_seconds":  <number or null>,',
    '  "confidence":      <0.0 to 1.0>,',
    '  "notes":           "<one sentence describing what you saw, e.g. camera angle, ball visibility, edge cases>"',
    '}',
    '',
    'If either event is unclear or off-screen, set that field to null and lower the confidence.',
  ].join('\n');
}

function stripCodeFences(s: string): string {
  // Gemini frequently wraps JSON in ```json … ``` despite the prompt asking
  // it not to. Strip a leading/trailing fence if present.
  return s
    .trim()
    .replace(/^```(?:json|javascript)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseAnalysisJson(text: string): AnalysisJson | null {
  const stripped = stripCodeFences(text);
  // Extract the first {...} block in case Gemini emits extra text before/after.
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as AnalysisJson;
    return obj;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'Gemini engine is not configured. Set GOOGLE_AI_API_KEY in your server env (.env.local for dev, Vercel → Environment Variables for prod). Free key at https://aistudio.google.com/apikey',
      },
      { status: 503 },
    );
  }

  let body: { videoBase64?: string; videoMime?: string; distanceM?: number; model?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.videoBase64 || !body.videoMime) {
    return NextResponse.json({ error: 'videoBase64 and videoMime are required' }, { status: 400 });
  }
  if (!/^video\/(mp4|webm|quicktime|mov|x-m4v)$/.test(body.videoMime)) {
    return NextResponse.json({ error: `Unsupported videoMime: ${body.videoMime}` }, { status: 400 });
  }
  if (!Number.isFinite(body.distanceM) || (body.distanceM ?? 0) <= 0) {
    return NextResponse.json({ error: 'distanceM must be a positive number (pitch length in meters)' }, { status: 400 });
  }

  // Decode just to verify size; we forward the base64 string itself to Gemini.
  const approxBytes = Math.floor((body.videoBase64.length * 3) / 4);
  if (approxBytes > MAX_INLINE_BYTES) {
    return NextResponse.json(
      { error: `Clip is ~${(approxBytes / 1024 / 1024).toFixed(1)} MB — over our ~18 MB inline limit. Record a shorter clip or lower resolution.` },
      { status: 413 },
    );
  }

  const model = (body.model || DEFAULT_MODEL).trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const requestBody = {
    contents: [{
      parts: [
        { text: buildPrompt(body.distanceM!) },
        { inline_data: { mime_type: body.videoMime, data: body.videoBase64 } },
      ],
    }],
    // Tight generation knobs — we want structured JSON, not creative prose.
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 400,
      responseMimeType: 'application/json',
    },
  };

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(requestBody),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Network error reaching Gemini' },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    let text = '';
    try { text = await upstream.text(); } catch { /* swallow */ }
    return NextResponse.json(
      { error: `Gemini ${upstream.status}: ${text.slice(0, 400)}` },
      { status: 502 },
    );
  }

  let raw: GeminiResponse;
  try { raw = await upstream.json(); } catch {
    return NextResponse.json({ error: 'Gemini returned non-JSON' }, { status: 502 });
  }

  if (raw.error) {
    return NextResponse.json({ error: `Gemini: ${raw.error.message ?? 'unknown'}` }, { status: 502 });
  }

  const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) {
    return NextResponse.json({ error: 'Gemini response had no text part' }, { status: 502 });
  }

  const parsed = parseAnalysisJson(text);
  if (!parsed) {
    return NextResponse.json(
      { error: 'Could not parse Gemini\'s JSON output', rawText: text.slice(0, 600) },
      { status: 502 },
    );
  }

  return NextResponse.json({
    releaseMs:  typeof parsed.release_seconds === 'number' ? Math.round(parsed.release_seconds * 1000) : null,
    bounceMs:   typeof parsed.bounce_seconds  === 'number' ? Math.round(parsed.bounce_seconds  * 1000) : null,
    confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
    notes:      parsed.notes ?? null,
    model,
  });
}
