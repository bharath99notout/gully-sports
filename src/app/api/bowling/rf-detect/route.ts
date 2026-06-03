import { NextResponse } from 'next/server';

/**
 * Proxy to Roboflow's hosted Inference API for the Bowling Analyzer.
 *
 * Why a proxy (mirrors the HF route's reasoning):
 *   * Keeps ROBOFLOW_API_KEY server-side; the browser never sees it.
 *   * Roboflow takes one image at a time, so per-frame round-trips are the
 *     natural shape for a video analyzer anyway.
 *
 * Request body:
 *   {
 *     imageDataUrl: "data:image/jpeg;base64,…",
 *     model:        "workspace/project/version"   // e.g. "roboflow-100/sport-ball/2"
 *   }
 *
 * Response (normalised to the SAME shape the HF route emits, so the same
 * analyzer code can consume either):
 *   {
 *     detections: [{ label, score, box: { x, y, w, h } }],   // top-left + WH
 *     model:      "workspace/project/version"
 *   }
 *
 * Roboflow's raw response uses CENTER coordinates + width/height per
 * prediction. We translate to top-left in the same shape as HF's pipeline.
 */

interface RfPrediction {
  x: number;       // center
  y: number;       // center
  width: number;
  height: number;
  confidence: number;
  class: string;
}

export async function POST(req: Request) {
  const apiKey = process.env.ROBOFLOW_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'Roboflow engine is not configured. Set ROBOFLOW_API_KEY in your server env (.env.local for dev, Vercel → Environment Variables for prod), then redeploy.',
      },
      { status: 503 },
    );
  }

  let body: { imageDataUrl?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.imageDataUrl || !body.imageDataUrl.startsWith('data:image/')) {
    return NextResponse.json({ error: 'imageDataUrl must be a data: URL' }, { status: 400 });
  }
  if (!body.model || !/^[^/]+\/[^/]+\/\d+$/.test(body.model.trim())) {
    return NextResponse.json(
      { error: 'model must be of the form "workspace/project/version" (find this on the model\'s Roboflow Universe page)' },
      { status: 400 },
    );
  }

  // Roboflow's hosted detection endpoint accepts the base64-encoded image
  // as the POST body with form-urlencoded content type. The data URL prefix
  // must be stripped — Roboflow wants raw base64, not the full data: URL.
  const commaIdx = body.imageDataUrl.indexOf(',');
  if (commaIdx < 0) {
    return NextResponse.json({ error: 'Malformed data URL' }, { status: 400 });
  }
  const b64 = body.imageDataUrl.slice(commaIdx + 1);
  if (b64.length === 0 || b64.length > 4_000_000) {
    return NextResponse.json({ error: 'Image data must be 1B-4MB' }, { status: 400 });
  }

  const model = body.model.trim();
  // Confidence: 25 is a permissive default that still filters out noise.
  // Overlap: how much two detections can share before NMS removes one.
  const rfUrl = `https://detect.roboflow.com/${model}?api_key=${encodeURIComponent(apiKey)}&confidence=25&overlap=30`;

  let upstream: Response;
  try {
    upstream = await fetch(rfUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    b64,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Network error reaching Roboflow' },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    let text = '';
    try { text = await upstream.text(); } catch { /* swallow */ }
    return NextResponse.json(
      { error: `Roboflow ${upstream.status}: ${text.slice(0, 300)}` },
      { status: upstream.status === 401 || upstream.status === 403 ? 502 : 502 },
    );
  }

  let raw: unknown;
  try { raw = await upstream.json(); } catch {
    return NextResponse.json({ error: 'Roboflow returned non-JSON' }, { status: 502 });
  }

  // Normalise center+wh → topleft+wh and map fields to match the HF shape.
  const predictions = (raw as { predictions?: RfPrediction[] }).predictions ?? [];
  const detections = predictions
    .filter(p => p && typeof p.confidence === 'number' && typeof p.x === 'number')
    .map(p => ({
      label: p.class,
      score: p.confidence,
      box: {
        x: Math.round(p.x - p.width  / 2),
        y: Math.round(p.y - p.height / 2),
        w: Math.round(p.width),
        h: Math.round(p.height),
      },
    }));

  return NextResponse.json({ detections, model });
}
