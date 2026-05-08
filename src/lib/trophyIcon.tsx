import { ImageResponse } from 'next/og';

/**
 * Shared trophy-icon renderer used by every PNG icon route
 * (/icon-192, /icon-512, and their maskable variants) plus the
 * existing /apple-icon route.
 *
 * `maskable` shrinks the trophy so the entire glyph stays inside the
 * inner 80% safe zone Android uses for adaptive-icon masks.
 */
export function renderTrophyIcon(
  size: number,
  opts: { maskable?: boolean } = {},
): ImageResponse {
  const maskable = opts.maskable ?? false;

  // Trophy emoji glyph occupies ~52% of width on a normal icon, ~38% on a
  // maskable one (so it survives circle/squircle masking).
  const glyphPx = Math.round(size * (maskable ? 0.38 : 0.52));
  const labelPx = Math.round(size * 0.13);
  const labelMt = Math.round(size * 0.025);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #064e3b 0%, #030712 60%, #030712 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#10b981',
          fontWeight: 900,
          fontFamily: 'system-ui',
        }}
      >
        <div style={{ fontSize: glyphPx, lineHeight: 1 }}>🏆</div>
        {/* Hide the wordmark on small icons — illegible below ~256px */}
        {size >= 256 && (
          <div style={{ fontSize: labelPx, marginTop: labelMt, letterSpacing: -1 }}>
            GullySports
          </div>
        )}
      </div>
    ),
    { width: size, height: size },
  );
}
