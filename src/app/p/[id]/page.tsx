import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Trophy, ArrowLeft } from 'lucide-react';
import AthleteCard from '@/components/AthleteCard';
import ShareButton from '@/components/ShareButton';
import FeedMatchCard from '@/components/FeedMatchCard';
import { buildAthleteData, enrichStatsWithTeamNames } from '@/lib/athleteData';
import { calcCaliber, getCaliberLabel, SportKey } from '@/lib/caliber';
import { headers } from 'next/headers';

interface Props { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles').select('name, avatar_url').eq('id', id).single();

  const playerName = (profile?.name ?? '').trim() || 'GullySports Player';
  const title = `${playerName} – GullySports`;
  const description = `Check out ${playerName}'s gully cricket, football and badminton profile on GullySports — caliber, stats and recent matches.`;

  // Cache-bust the OG image whenever the avatar or name changes so WhatsApp /
  // Twitter / Facebook crawlers fetch a fresh version instead of a stale one.
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
    openGraph: {
      title,
      description,
      type: 'profile',
      siteName: 'GullySports',
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage.url],
    },
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: profile }, { data: allStats }, { data: rawMatches }, { data: myMatchPlayers }] = await Promise.all([
    supabase.from('profiles').select('id, name, avatar_url, created_at').eq('id', id).single(),
    supabase
      .from('player_match_stats')
      .select('sport, runs_scored, wickets_taken, catches_taken, goals_scored, match_id, matches(winner_team_id, winner_team_name, team_a_id, team_b_id, team_a_name, team_b_name)')
      .eq('player_id', id),
    supabase
      .from('matches')
      .select(`
        id, sport, status, team_a_name, team_b_name,
        winner_team_id, winner_team_name, team_a_id, team_b_id, played_at,
        match_scores(team_name, runs, wickets, overs_faced, goals, sets),
        player_match_stats(player_id, runs_scored, wickets_taken, catches_taken, goals_scored, profiles(id, name))
      `)
      .neq('status', 'upcoming')
      .order('played_at', { ascending: false })
      .limit(10),
    supabase
      .from('match_players')
      .select('match_id, team_name')
      .eq('player_id', id),
  ]);

  if (!profile) notFound();

  const isOwnProfile = !!user && user.id === profile.id;

  const enrichedStats = enrichStatsWithTeamNames(
    (allStats ?? []) as unknown as Parameters<typeof enrichStatsWithTeamNames>[0],
    (myMatchPlayers ?? []) as Array<{ match_id: string; team_name: string }>,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const athleteData = buildAthleteData(profile as any, enrichedStats);

  const playerMatchIds = new Set((allStats ?? []).map((s: { match_id: string }) => s.match_id));
  const feedMatches = (rawMatches ?? [])
    .filter((m: { id: string }) => playerMatchIds.has(m.id))
    .slice(0, 5)
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

  // Share URL + text
  const hdrs = await headers();
  const host = hdrs.get('host') ?? '';
  const proto = hdrs.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const origin = `${proto}://${host}`;
  const shareUrl = `${origin}/p/${id}`;
  // Cache-bust the OG image so re-uploads / name changes refresh on share targets
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
  const shareText = [`🏆 ${athleteData.name} on GullySports`, ...sportLines].join('\n');

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Minimal public header — show player name when viewing someone else
          so identity is obvious even after scrolling */}
      <div className="bg-gray-950 border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          {user && !isOwnProfile ? (
            <Link href="/players" className="flex items-center gap-2 min-w-0 group">
              <ArrowLeft size={16} className="text-gray-400 group-hover:text-white shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 leading-none">Profile</p>
                <p className="text-sm font-bold text-white truncate leading-tight">
                  {athleteData.name?.trim() || 'Player'}
                </p>
              </div>
            </Link>
          ) : (
            <Link href="/" className="flex items-center gap-2 font-bold text-emerald-400 text-lg">
              <Trophy size={20} /> GullySports
            </Link>
          )}

          {user ? (
            <Link href="/dashboard" className="text-xs text-emerald-400 hover:underline shrink-0">My profile →</Link>
          ) : (
            <Link href="/auth/signup" className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg font-semibold shrink-0">
              Join free
            </Link>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        <div className="flex justify-end">
          <ShareButton
            text={shareText}
            url={shareUrl}
            title={`${athleteData.name} – GullySports`}
            variant="inline"
            label="Share profile"
            imageUrl={ogImageUrl}
            imageFilename={`${(athleteData.name || 'gullysports').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-gullysports.png`}
          />
        </div>

        <AthleteCard athlete={athleteData} />

        {feedMatches.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-white mb-3">Recent Matches</h2>
            <div className="flex flex-col gap-3">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {feedMatches.map((m: any) => <FeedMatchCard key={m.id} match={m} />)}
            </div>
          </div>
        )}

        {/* CTA for anonymous visitors */}
        {!user && (
          <div className="bg-gradient-to-br from-emerald-950/40 to-gray-900 border border-emerald-800/60 rounded-2xl p-5 text-center">
            <p className="text-lg font-bold text-white mb-1">🏆 Score your own matches</p>
            <p className="text-sm text-gray-400 mb-4">
              Track cricket, football, badminton & table tennis. Build your player caliber.
            </p>
            <Link href="/auth/signup"
              className="inline-block bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold">
              Join GullySports →
            </Link>
          </div>
        )}

        <p className="text-center text-[11px] text-gray-700 mt-4">Public profile · GullySports</p>
      </div>
    </div>
  );
}
