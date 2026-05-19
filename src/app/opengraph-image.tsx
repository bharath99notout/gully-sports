import { readFileSync } from 'fs';
import { join } from 'path';
import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
/** Node so we can read `public/icons` at build/request time without relying on a live origin fetch. */
export const runtime = 'nodejs';
export const alt = 'GullySports — score your local matches';

export default function LandingOgImage() {
  const buf = readFileSync(join(process.cwd(), 'public/icons/icon-512.png'));
  const iconDataUrl = `data:image/png;base64,${buf.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background:
            'radial-gradient(circle at 80% 20%, #064e3b 0%, #030712 60%, #030712 100%)',
          display: 'flex',
          flexDirection: 'column',
          padding: '72px 80px',
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={iconDataUrl}
            width={72}
            height={72}
            alt=""
            style={{ borderRadius: 18, objectFit: 'cover' }}
          />
          <div style={{ fontSize: 44, fontWeight: 900, color: '#10b981', letterSpacing: -1 }}>
            GullySports
          </div>
        </div>

        <div
          style={{
            marginTop: 96,
            fontSize: 96,
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: -3,
            maxWidth: 1000,
          }}
        >
          Score your gully matches in seconds.
        </div>

        <div style={{ marginTop: 32, fontSize: 32, color: '#9ca3af', maxWidth: 900, fontWeight: 500 }}>
          Cricket · Football · Badminton · Table Tennis · Pickleball · Foosball
          — track live scores, player caliber and match history.
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 'auto' }}>
          {[
            { emoji: '🏏', label: 'Cricket' },
            { emoji: '⚽', label: 'Football' },
            { emoji: '🏸', label: 'Badminton' },
            { emoji: '🏓', label: 'Table Tennis' },
            { emoji: '🥒', label: 'Pickleball' },
            { emoji: '🥅', label: 'Foosball' },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'rgba(17,24,39,0.85)',
                border: '1px solid rgba(75,85,99,0.5)',
                borderRadius: 9999,
                padding: '14px 22px',
                fontSize: 24,
                color: '#d1d5db',
                fontWeight: 600,
              }}
            >
              <span style={{ fontSize: 28 }}>{s.emoji}</span>
              {s.label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
