import { ImageResponse } from 'next/og';
import { createClient } from '@/lib/supabase/server';
import {
  buildAthleteData,
  enrichStatsWithTeamNames,
} from '@/lib/athleteData';
import { calcCaliber, getCaliberLabel, SportKey } from '@/lib/caliber';

// 1200x630 is the WhatsApp / Twitter / FB recommended OG size
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Run on Node, not edge — we use the Supabase server client which depends on
// the cookies/headers Node APIs available in our setup.
export const runtime = 'nodejs';
// Cache the rendered PNG for an hour. The route URL is versioned by an
// avatar+name hash (?v=...) so any meaningful change busts the cache instantly.
export const revalidate = 3600;

const SPORT_META: Record<SportKey, { emoji: string; label: string }> = {
  cricket:      { emoji: '🏏', label: 'Cricket' },
  football:     { emoji: '⚽', label: 'Football' },
  badminton:    { emoji: '🏸', label: 'Badminton' },
  table_tennis: { emoji: '🏓', label: 'T. Tennis' },
};

export default async function ProfileOgImage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: profile }, { data: stats }, { data: mp }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name, avatar_url, created_at')
      .eq('id', id)
      .single(),
    supabase
      .from('player_match_stats')
      .select('sport, runs_scored, wickets_taken, catches_taken, goals_scored, match_id, matches(winner_team_id, winner_team_name, team_a_id, team_b_id, team_a_name, team_b_name, confirmation_state)')
      .eq('player_id', id),
    supabase
      .from('match_players')
      .select('match_id, team_name')
      .eq('player_id', id),
  ]);

  const playerName = (profile?.name ?? '').trim() || 'GullySports Player';
  const initial = playerName[0]?.toUpperCase() ?? '?';
  const avatarUrl = profile?.avatar_url || null;

  // Pre-fetch the avatar bytes so satori (next/og) can embed them. If the URL
  // is unreachable for any reason we silently fall back to the initial avatar
  // — never let a broken image break the whole OG response.
  let avatarDataUri: string | null = null;
  if (avatarUrl) {
    try {
      const res = await fetch(avatarUrl, { cache: 'no-store' });
      if (res.ok) {
        const ct = res.headers.get('content-type') ?? 'image/jpeg';
        const buf = Buffer.from(await res.arrayBuffer());
        avatarDataUri = `data:${ct};base64,${buf.toString('base64')}`;
      }
    } catch {
      avatarDataUri = null;
    }
  }

  const enriched = enrichStatsWithTeamNames(
    (stats ?? []) as unknown as Parameters<typeof enrichStatsWithTeamNames>[0],
    (mp ?? []) as Array<{ match_id: string; team_name: string }>,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const athlete = buildAthleteData((profile ?? { id, name: playerName, avatar_url: null, created_at: new Date().toISOString() }) as any, enriched);

  // Active sports + their score, sorted strongest first, capped to 3
  const sports = (Object.keys(SPORT_META) as SportKey[])
    .map(s => ({ key: s, score: calcCaliber(s, athlete.sportStats[s]), matches: athlete.sportStats[s].matches }))
    .filter(s => s.matches > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const overall = sports.length ? Math.max(...sports.map(s => s.score)) : 0;
  const overallLabel = overall > 0 ? getCaliberLabel(overall) : 'Rising Talent';
  const totalMatches = (Object.keys(SPORT_META) as SportKey[])
    .reduce((sum, s) => sum + athlete.sportStats[s].matches, 0);
  const totalWins = (Object.keys(SPORT_META) as SportKey[])
    .reduce((sum, s) => sum + athlete.sportStats[s].wins, 0);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background:
            'radial-gradient(circle at 20% 0%, #064e3b 0%, #030712 55%, #030712 100%)',
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
          padding: '56px 64px',
        }}
      >
        {/* Top bar — branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
            }}
          >
            🏆
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#10b981', letterSpacing: -0.5 }}>
            GullySports
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 20, color: '#6b7280', fontWeight: 600 }}>
            Player Profile
          </div>
        </div>

        {/* Hero — avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 36, marginTop: 56 }}>
          <div
            style={{
              width: 188,
              height: 188,
              borderRadius: 9999,
              background: 'linear-gradient(135deg, #10b981 0%, #0f766e 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 92,
              fontWeight: 900,
              color: 'white',
              border: '8px solid #0b1220',
              boxShadow: '0 0 0 2px rgba(16,185,129,0.4)',
              overflow: 'hidden',
            }}
          >
            {avatarDataUri ? (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img
                src={avatarDataUri}
                width={188}
                height={188}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              initial
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 760 }}>
            <div style={{ fontSize: 22, color: '#34d399', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2 }}>
              {overallLabel}
            </div>
            <div
              style={{
                fontSize: 84,
                fontWeight: 900,
                lineHeight: 1.05,
                letterSpacing: -2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 760,
              }}
            >
              {playerName}
            </div>
            <div style={{ fontSize: 24, color: '#9ca3af', fontWeight: 500 }}>
              {totalMatches} matches · {totalWins} wins
            </div>
          </div>
        </div>

        {/* Sports caliber strip */}
        <div style={{ display: 'flex', gap: 20, marginTop: 56 }}>
          {(sports.length > 0 ? sports : [{ key: 'cricket' as SportKey, score: 0, matches: 0 }]).map(({ key, score }) => (
            <div
              key={key}
              style={{
                flex: 1,
                background: 'rgba(17,24,39,0.85)',
                border: '1px solid rgba(75,85,99,0.5)',
                borderRadius: 22,
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, color: '#d1d5db', fontWeight: 700 }}>
                <span style={{ fontSize: 28 }}>{SPORT_META[key].emoji}</span>
                {SPORT_META[key].label}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 56, fontWeight: 900, color: score > 0 ? '#34d399' : '#4b5563', letterSpacing: -2 }}>
                  {score || '–'}
                </span>
                {score > 0 && (
                  <span style={{ fontSize: 18, color: '#9ca3af', fontWeight: 600 }}>
                    / 100
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer CTA */}
        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 32,
          }}
        >
          <div style={{ fontSize: 22, color: '#9ca3af', fontWeight: 500 }}>
            Score your gully cricket, football & badminton matches
          </div>
          <div
            style={{
              background: '#10b981',
              color: '#031414',
              fontSize: 22,
              fontWeight: 800,
              padding: '12px 22px',
              borderRadius: 14,
            }}
          >
            View profile →
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
