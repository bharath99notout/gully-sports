import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
        <div style={{ fontSize: 92, lineHeight: 1 }}>🏆</div>
        <div style={{ fontSize: 28, marginTop: 6, letterSpacing: -1 }}>GullySports</div>
      </div>
    ),
    { ...size }
  );
}
