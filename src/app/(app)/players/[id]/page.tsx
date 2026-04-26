import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import FeedMatchCard from '@/components/FeedMatchCard';
import AthleteCard from '@/components/AthleteCard';
import { buildAthleteData, enrichStatsWithTeamNames } from '@/lib/athleteData';
import { fetchPlayerDetailedStats } from '@/lib/playerDetailedStats';
import CricketStatsSection from '@/components/CricketStatsSection';
import FootballStatsPanel from '@/components/FootballStatsPanel';
import RacquetStatsPanel from '@/components/RacquetStatsPanel';
import ShareButton from '@/components/ShareButton';
import { headers } from 'next/headers';
import { calcCaliber, getCaliberLabel, getPlayerTaglines, SportKey } from '@/lib/caliber';

interface Props { params: Promise<{ id: string }> }

/** Stable accent per profile so switching between players feels visually distinct. */
function hueFromPlayerId(playerId: string): number {
  let h = 0;
  for (let i = 0; i < playerId.length; i++) {
    h = (h << 5) - h + playerId.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % 360;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles').select('name, avatar_url').eq('id', id).single();

  const playerName = (profile?.name ?? '').trim() || 'GullySports Player';
  const title = `${playerName} – GullySports`;
  const description = `Check out ${playerName}'s gully cricket, football and badminton profile on GullySports — caliber, stats and recent matches.`;

  // Crawlers (WhatsApp/Twitter/Facebook) prefer the public /p/<id> route, so we
  // point the OG image to its versioned URL. Versioning ensures stale previews
  // refresh after avatar/name changes.
  const ogVersion = `${profile?.avatar_url ?? 'noavatar'}|${profile?.name ?? ''}`
    .split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  const ogImage = {
    url: `/p/${id}/opengraph-image?v=${Math.abs(ogVersion)}`,
    width: 1200,
    height: 630,
    alt: `${playerName} on GullySports`,
  };

  return {
    title,
    description,
    openGraph: { title, description, type: 'profile', siteName: 'GullySports', images: [ogImage] },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage.url] },
  };
}

export default async function PublicPlayerPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  // Non-owner profile views should stay in public read-only mode.
  if (user && user.id !== id) {
    redirect(`/p/${id}`);
  }

  const [{ data: profile }, { data: allStats }, { data: rawMatches }, { data: myMatchPlayers }] = await Promise.all([
    supabase.from('profiles').select('id, name, avatar_url, created_at').eq('id', id).single(),

    supabase
      .from('player_match_stats')
      .select('sport, runs_scored, wickets_taken, catches_taken, goals_scored, balls_faced, fours, sixes, balls_bowled, runs_conceded, is_out, match_id, matches(winner_team_id, winner_team_name, team_a_id, team_b_id, team_a_name, team_b_name, confirmation_state)')
      .eq('player_id', id),

    supabase
      .from('matches')
      .select(`
        id, sport, status, confirmation_state, team_a_name, team_b_name,
        winner_team_id, winner_team_name, team_a_id, team_b_id, played_at,
        match_scores(team_name, runs, wickets, overs_faced, goals, sets),
        player_match_stats(player_id, runs_scored, wickets_taken, catches_taken, goals_scored, profiles(id, name))
      `)
      .neq('status', 'upcoming')
      .order('played_at', { ascending: false })
      .limit(15),

    supabase
      .from('match_players')
      .select('match_id, team_name')
      .eq('player_id', id),
  ]);

  if (!profile) notFound();

  const isOwnProfile = !!user && user.id === profile.id;
  const playerName = (profile.name ?? '').trim() || 'Player';

  const enrichedStats = enrichStatsWithTeamNames(
    (allStats ?? []) as unknown as Parameters<typeof enrichStatsWithTeamNames>[0],
    (myMatchPlayers ?? []) as Array<{ match_id: string; team_name: string }>,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const athleteData = buildAthleteData(profile as any, enrichedStats);
  const detailedStats = await fetchPlayerDetailedStats(
    id,
    enrichedStats,
    (myMatchPlayers ?? []) as Array<{ match_id: string; team_name: string }>,
  );

  const expandableDetails: Partial<Record<SportKey, React.ReactNode>> = {};
  if (detailedStats.cricket.innings > 0
      || detailedStats.cricket.bowlingInnings > 0
      || detailedStats.cricket.totalCatches > 0) {
    expandableDetails.cricket = <CricketStatsSection detail={detailedStats.cricket} />;
  }
  if (detailedStats.football.matches > 0) {
    expandableDetails.football = <FootballStatsPanel detail={detailedStats.football} />;
  }
  if (detailedStats.badminton.matches > 0) {
    expandableDetails.badminton = <RacquetStatsPanel detail={detailedStats.badminton} showFormatSplit />;
  }
  if (detailedStats.tableTennis.matches > 0) {
    expandableDetails.table_tennis = <RacquetStatsPanel detail={detailedStats.tableTennis} />;
  }

  const playerMatchIds = new Set((allStats ?? []).map((s: { match_id: string }) => s.match_id));
  const feedMatches = (rawMatches ?? [])
    .filter((m: { id: string }) => playerMatchIds.has(m.id))
    .map((m: Record<string, unknown>) => ({
      ...m,
      player_performances: ((m.player_match_stats as { player_id: string; runs_scored: number; wickets_taken: number; catches_taken: number; goals_scored: number; profiles: { id: string; name: string } | null }[]) ?? []).map(s => ({
        player_id: s.player_id,
        name: s.profiles?.name ?? 'Unknown',
        runs_scored: s.runs_scored,
        wickets_taken: s.wickets_taken,
        catches_taken: s.catches_taken,
        goals_scored: s.goals_scored,
      })),
    }));

  // Build share text
  const hdrs = await headers();
  const host = hdrs.get('host') ?? '';
  const proto = hdrs.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const origin = `${proto}://${host}`;
  const shareUrl = `${origin}/p/${id}`;
  const ogVersion = `${profile.avatar_url ?? 'noavatar'}|${profile.name ?? ''}`
    .split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  const ogImageUrl = `${origin}/p/${id}/opengraph-image?v=${Math.abs(ogVersion)}`;
  const sportLines = (['cricket', 'football', 'badminton', 'table_tennis'] as SportKey[])
    .filter(s => athleteData.sportStats[s].matches > 0)
    .map(s => {
      const score = calcCaliber(s, athleteData.sportStats[s]);
      const label = getCaliberLabel(score);
      const emoji = s === 'cricket' ? '🏏' : s === 'football' ? '⚽' : s === 'badminton' ? '🏸' : '🏓';
      return `${emoji} ${label} (${score})`;
    });
  const shareText = [
    `🏆 ${athleteData.name} on GullySports`,
    ...sportLines,
  ].join('\n');

  const accentHue = hueFromPlayerId(id);
  const profileTaglines = getPlayerTaglines(athleteData.sportStats);
  const totalRecorded = Object.values(athleteData.sportStats).reduce((a, s) => a + s.matches, 0);

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">

      <div className="flex items-center justify-between gap-3">
        <Link
          href="/players"
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white"
        >
          <ArrowLeft size={14} /> Players
        </Link>
        <ShareButton
          text={shareText}
          url={shareUrl}
          title={`${playerName} – GullySports`}
          variant="inline"
          label="Share profile"
          imageUrl={ogImageUrl}
          imageFilename={`${(playerName || 'gullysports').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-gullysports.png`}
        />
      </div>

      {/* Strong identity: color accent + breadcrumb + large name so each player is unmistakable */}
      <section
        className="rounded-2xl overflow-hidden border-2 bg-gray-950/90 shadow-2xl"
        style={{
          borderColor: `hsl(${accentHue} 38% 32%)`,
          boxShadow: `0 0 0 1px hsl(${accentHue} 30% 18% / 0.45), 0 20px 50px -20px hsl(${accentHue} 35% 5% / 0.55)`,
        }}
      >
        <div
          className="h-1.5 w-full"
          style={{
            background: `linear-gradient(90deg, hsl(${accentHue} 55% 42%), hsl(${(accentHue + 48) % 360} 48% 50%), hsl(${(accentHue + 22) % 360} 45% 38%))`,
          }}
        />
        <div className="p-5 sm:p-6 flex flex-col sm:flex-row gap-5 sm:items-center sm:gap-6">
          <div className="shrink-0 flex justify-center sm:justify-start">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={playerName}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-2 border-gray-800 shadow-lg"
                style={{ boxShadow: `0 0 0 2px hsl(${accentHue} 40% 28% / 0.5)` }}
              />
            ) : (
              <div
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl flex items-center justify-center text-4xl sm:text-5xl font-black text-white border-2 border-gray-800"
                style={{
                  background: `linear-gradient(145deg, hsl(${accentHue} 45% 38%), hsl(${(accentHue + 35) % 360} 40% 28%))`,
                }}
              >
                {playerName.trim().charAt(0).toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <nav className="text-[11px] text-gray-500 mb-2 flex flex-wrap items-center justify-center sm:justify-start gap-x-1 gap-y-0.5">
              <Link href="/players" className="text-emerald-500/90 hover:text-emerald-400 font-medium">
                Players
              </Link>
              <span className="text-gray-600">/</span>
              <span className="text-gray-300 font-medium truncate max-w-[min(100%,14rem)]">{playerName}</span>
            </nav>
            {isOwnProfile ? (
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-emerald-400/95 mb-1">
                Your public profile
              </p>
            ) : (
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-400/95 mb-1">
                Viewing another player
              </p>
            )}
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight truncate">
              {playerName}
            </h1>
            {!isOwnProfile && (
              <p className="text-xs text-amber-100/90 mt-2.5 px-3 py-2 rounded-xl bg-amber-950/40 border border-amber-800/45 text-left inline-block max-w-full">
                Caliber and match list below are for <span className="font-semibold text-white">{playerName}</span>
                , not your account. Open <Link href="/profile" className="underline decoration-amber-600/80 hover:text-white">Profile</Link> for yours.
              </p>
            )}
            <p className="text-sm text-gray-500 mt-2">
              Member since {athleteData.joinedYear}
              {totalRecorded > 0 && (
                <>
                  <span className="text-gray-600"> · </span>
                  <span className="text-gray-300 font-medium">{totalRecorded}</span>
                  {' '}recorded match{totalRecorded === 1 ? '' : 'es'}
                </>
              )}
            </p>
            {profileTaglines.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center sm:justify-start gap-1.5">
                {profileTaglines.map((t, i) => (
                  <span
                    key={i}
                    className="text-xs px-2.5 py-1 rounded-full bg-gray-900/80 border text-gray-300"
                    style={{ borderColor: `hsl(${accentHue} 25% 28%)` }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <AthleteCard athlete={athleteData} expandableDetails={expandableDetails} hideIdentityBlock />

      {feedMatches.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-white mb-1">
            Match history — <span className="text-emerald-400/90">{playerName}</span>
          </h2>
          <p className="text-xs text-gray-500 mb-3">Only matches this player took part in.</p>
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {feedMatches.map((m: any) => <FeedMatchCard key={m.id} match={m} />)}
          </div>
        </div>
      )}

      {feedMatches.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          <p className="text-3xl mb-2">🏟️</p>
          <p className="text-gray-500 text-sm">No matches played yet.</p>
        </div>
      )}
    </div>
  );
}
