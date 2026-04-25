import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
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
import { calcCaliber, getCaliberLabel, SportKey } from '@/lib/caliber';

interface Props { params: Promise<{ id: string }> }

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

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">

      {/* Page header — makes whose profile this is unmistakable, even when
          opened directly via /players/<id> (not via search) */}
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

      <div className="-mb-2">
        <p className="text-[11px] uppercase tracking-wider text-gray-500">
          {isOwnProfile ? 'Your profile' : 'Player profile'}
        </p>
        <h1 className="text-2xl font-bold text-white truncate">{playerName}</h1>
      </div>

      <AthleteCard athlete={athleteData} expandableDetails={expandableDetails} />

      {feedMatches.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-white mb-3">Match History</h2>
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
