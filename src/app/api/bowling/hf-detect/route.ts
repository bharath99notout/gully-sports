import { NextResponse } from 'next/server';

/**
 * Proxy to Hugging Face Inference API for object detection on a single
 * frame. The HF token stays server-side; the client never sees it.
 *
 * Why a proxy + per-frame round-trip instead of streaming the whole video:
 *   * HF Inference API takes one image at a time (no video endpoint).
 *   * Sending the entire video as multipart would blow past Next's default
 *     body-size limits. One frame per request keeps each call small.
 *   * Free tier ~30 RPM — sequential calls fit comfortably for a 15-frame
 *     sample per analysis.
 *
 * Request body:  { imageDataUrl: "data:image/jpeg;base64,…", model?: string }
 * Response:      { detections: [{ label, score, box: { x, y, w, h } }] }
 *
 * Defaults to facebook/detr-resnet-50 (well-known, COCO-trained, has a
 * "sports ball" class). Caller can pass any HF object-detection model id —
 * including cricket-specific community uploads — to experiment.
 */

const DEFAULT_MODEL = 'facebook/detr-resnet-50';

interface HfDetection {
  label: string;
  score: number;
  box: { xmin: number; ymin: number; xmax: number; ymax: number };
}

export async function POST(req: Request) {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        error:
          'Hugging Face engine is not configured. Set HUGGINGFACE_API_TOKEN in your server env (.env.local for dev, Vercel → Environment Variables for prod), then redeploy.',
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

  // The HF Inference API for object detection accepts raw image bytes,
  // and the new router endpoint validates Content-Type strictly — must be
  // image/jpeg, image/png etc, not application/octet-stream. Parse the
  // MIME out of the data: URL and forward it.
  const commaIdx = body.imageDataUrl.indexOf(',');
  if (commaIdx < 0) {
    return NextResponse.json({ error: 'Malformed data URL' }, { status: 400 });
  }
  const header = body.imageDataUrl.slice(0, commaIdx); // e.g. "data:image/jpeg;base64"
  const mimeMatch = header.match(/^data:(image\/(?:jpeg|jpg|png|webp|bmp|gif|tiff));base64$/);
  if (!mimeMatch) {
    return NextResponse.json(
      { error: 'imageDataUrl must be base64-encoded image/{jpeg|png|webp|bmp|gif|tiff}' },
      { status: 400 },
    );
  }
  const mime = mimeMatch[1];
  const b64 = body.imageDataUrl.slice(commaIdx + 1);
  let bytes: Buffer;
  try {
    bytes = Buffer.from(b64, 'base64');
  } catch {
    return NextResponse.json({ error: 'Could not decode base64 image' }, { status: 400 });
  }
  if (bytes.length === 0 || bytes.length > 2_000_000) {
    return NextResponse.json({ error: 'Image must be 1B-2MB' }, { status: 400 });
  }

  const model = (body.model || DEFAULT_MODEL).trim();
  // HF's legacy `api-inference.huggingface.co/models/...` endpoint has been
  // phased out in favour of the inference router; some networks (corporate
  // proxies / DNS scopes) only let the router subdomain through. Path-shape
  // is identical so the body / response handling stays unchanged.
  const hfUrl = `https://router.huggingface.co/hf-inference/models/${encodeURIComponent(model)}`;

  let upstream: Response;
  try {
    upstream = await fetch(hfUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  mime,
      },
      body: new Blob([new Uint8Array(bytes)], { type: mime }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Network error reaching Hugging Face' },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    let text = '';
    try { text = await upstream.text(); } catch { /* swallow */ }
    return NextResponse.json(
      { error: `Hugging Face ${upstream.status}: ${text.slice(0, 300)}` },
      { status: upstream.status === 503 ? 503 : 502 },
    );
  }

  let hfRaw: unknown;
  try { hfRaw = await upstream.json(); } catch {
    return NextResponse.json({ error: 'Hugging Face returned non-JSON' }, { status: 502 });
  }

  // The shape from object-detection pipelines is consistent enough across
  // DETR / YOLOS variants: an array of { label, score, box: {xmin, ymin,
  // xmax, ymax} }. We normalise to a flat {x, y, w, h} so the client can
  // reuse the same trajectory algorithms as the MediaPipe path.
  const detections = Array.isArray(hfRaw)
    ? (hfRaw as HfDetection[])
        .filter(d => d && typeof d.score === 'number' && d.box)
        .map(d => ({
          label: d.label,
          score: d.score,
          box: {
            x: d.box.xmin,
            y: d.box.ymin,
            w: Math.max(0, d.box.xmax - d.box.xmin),
            h: Math.max(0, d.box.ymax - d.box.ymin),
          },
        }))
    : [];

  return NextResponse.json({ detections, model });
}
