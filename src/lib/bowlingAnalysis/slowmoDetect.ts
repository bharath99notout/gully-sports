'use client';

/**
 * Detect slow-motion captures from a video File by parsing MP4 metadata.
 *
 * Why this beats the bitrate heuristic:
 *   * Bitrate varies with codec, scene complexity, post-processing. Re-encoded
 *     shares (WhatsApp etc.) collapse a 240fps clip to ~10 Mbps — the bitrate
 *     test then says "normal" and we under-shoot.
 *   * Capture FPS is an explicit, structural property recorded in the MP4
 *     atoms (`mdhd` timescale + `stts` sample table). If the file still
 *     has metadata, we can read it directly.
 *
 * What we read:
 *   * `moov > trak > mdia > mdhd` → media timescale + duration
 *   * `moov > trak > mdia > minf > stbl > stts` → frame timing table
 *   * `moov > trak > mdia > hdlr` → track type (we only care about 'vide')
 *
 * effectiveCaptureFps = sampleCount × timescale / mediaDuration
 *
 * Limitations:
 *   * If `moov` is at the end of the file (faststart not applied), we'd need
 *     to fetch the tail. Most camera-captured iPhone files have moov first.
 *     If parsing fails the caller is expected to fall back to a heuristic.
 *   * Some Android phones encode 60/120fps natively without re-timing —
 *     the file fps then equals real fps and we (correctly) report no slo-mo,
 *     but the visual playback IS slower; users on those phones should pick
 *     the factor manually.
 */

// Read enough of the file to almost always include `moov`. iPhone slo-mo
// clips have it at the start; we'll know after this read if not.
const HEAD_BYTES = 4 * 1024 * 1024;

export type SlowmoFactor = 1 | 2 | 4 | 8;

export interface SlowmoDetection {
  factor: SlowmoFactor;
  captureFps: number | null;
  source: 'mp4-atoms' | 'unknown';
}

export async function detectSlowmoFactor(file: File): Promise<SlowmoDetection | null> {
  if (!file) return null;
  try {
    const head = await file.slice(0, Math.min(HEAD_BYTES, file.size)).arrayBuffer();
    const fps = readCaptureFpsFromMp4(new DataView(head));
    if (fps == null) return null;
    return { factor: factorFromFps(fps), captureFps: fps, source: 'mp4-atoms' };
  } catch {
    return null;
  }
}

function factorFromFps(fps: number): SlowmoFactor {
  if (fps >= 200) return 8;
  if (fps >= 100) return 4;
  if (fps >= 45)  return 2;
  return 1;
}

// ── MP4 atom walker ─────────────────────────────────────────────────────────
// MP4 / QuickTime boxes are length-prefixed: [u32 size][u32 type][...payload]
// If size == 1 the real size is the next u64. If size == 0 the box extends to
// EOF. We just need to find specific nested boxes — no need to materialise a
// tree. fourcc compared as ASCII text for readability.

function fourcc(view: DataView, offset: number): string {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

interface Range { start: number; end: number }

/** Iterate top-level boxes within [start, end). Returns inner payload ranges. */
function* boxes(view: DataView, start: number, end: number): IterableIterator<{ type: string; body: Range }> {
  let p = start;
  while (p + 8 <= end) {
    const sz = view.getUint32(p);
    const t  = fourcc(view, p + 4);
    let payloadStart = p + 8;
    let boxEnd: number;
    if (sz === 1) {
      // 64-bit largesize (we don't really expect this for moov/trak)
      const hi = view.getUint32(p + 8);
      const lo = view.getUint32(p + 12);
      boxEnd = p + hi * 2 ** 32 + lo;
      payloadStart = p + 16;
    } else if (sz === 0) {
      boxEnd = end;
    } else {
      boxEnd = p + sz;
    }
    if (boxEnd <= p || boxEnd > end) break; // malformed or truncated
    yield { type: t, body: { start: payloadStart, end: boxEnd } };
    p = boxEnd;
  }
}

function findBox(view: DataView, range: Range, type: string): Range | null {
  for (const b of boxes(view, range.start, range.end)) if (b.type === type) return b.body;
  return null;
}

/**
 * Walk to the video track's mdhd+stts and compute effective capture fps.
 * Returns null if any required box is missing or the math doesn't make sense.
 */
function readCaptureFpsFromMp4(view: DataView): number | null {
  const total = view.byteLength;
  const moov = findBox(view, { start: 0, end: total }, 'moov');
  if (!moov) return null;

  for (const b of boxes(view, moov.start, moov.end)) {
    if (b.type !== 'trak') continue;
    const mdia = findBox(view, b.body, 'mdia');
    if (!mdia) continue;

    // Confirm it's a video track via hdlr.handler_type === 'vide'
    const hdlr = findBox(view, mdia, 'hdlr');
    if (hdlr && hdlr.end - hdlr.start >= 16) {
      // hdlr layout: version(1) + flags(3) + pre_defined(4) + handler_type(4) + ...
      const handler = fourcc(view, hdlr.start + 8);
      if (handler !== 'vide') continue;
    }

    const mdhd = findBox(view, mdia, 'mdhd');
    const minf = findBox(view, mdia, 'minf');
    if (!mdhd || !minf) continue;
    const stbl = findBox(view, minf, 'stbl');
    if (!stbl) continue;
    const stts = findBox(view, stbl, 'stts');
    if (!stts) continue;

    const td = readMdhdTimescaleDuration(view, mdhd);
    const sc = readSttsSampleCount(view, stts);
    if (!td || !sc || td.duration <= 0) continue;

    // Some clips have absurdly small media durations; guard against /0
    const seconds = td.duration / td.timescale;
    if (seconds <= 0.05) continue;
    return sc / seconds;
  }
  return null;
}

function readMdhdTimescaleDuration(view: DataView, range: Range): { timescale: number; duration: number } | null {
  // mdhd layout:
  //   version(1) + flags(3)
  //   if version == 1: creation(8) + modification(8) + timescale(4) + duration(8)
  //   else:            creation(4) + modification(4) + timescale(4) + duration(4)
  const start = range.start;
  if (start + 4 > range.end) return null;
  const version = view.getUint8(start);
  if (version === 1) {
    if (start + 32 > range.end) return null;
    const timescale = view.getUint32(start + 20);
    const hi = view.getUint32(start + 24);
    const lo = view.getUint32(start + 28);
    const duration = hi * 2 ** 32 + lo;
    return { timescale, duration };
  } else {
    if (start + 20 > range.end) return null;
    const timescale = view.getUint32(start + 12);
    const duration  = view.getUint32(start + 16);
    return { timescale, duration };
  }
}

function readSttsSampleCount(view: DataView, range: Range): number | null {
  // stts layout:
  //   version(1) + flags(3) + entry_count(4) + [sample_count(4) sample_delta(4)] × entry_count
  const start = range.start;
  if (start + 8 > range.end) return null;
  const entryCount = view.getUint32(start + 4);
  if (entryCount <= 0) return null;
  if (start + 8 + entryCount * 8 > range.end) return null;
  let total = 0;
  for (let i = 0; i < entryCount; i++) {
    total += view.getUint32(start + 8 + i * 8);
  }
  return total;
}
