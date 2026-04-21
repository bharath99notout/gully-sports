import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import AthleteCard from '@/components/AthleteCard';
import AvatarUpload from '@/components/AvatarUpload';
import FeedMatchCard from '@/components/FeedMatchCard';
import { buildAthleteData } from '@/lib/athleteData';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: profile }, { data: myStats }, { data: rawFeed }, { data: liveMatches }] = await Promise.all([
    supabase.from('profiles').select('id, name, avatar_url, created_at').eq('id', user!.id).single(),

    supabase
      .from('player_match_stats')
      .select('sport, runs_scored, wickets_taken, catches_taken, goals_scored, match_id, matches(winner_team_id, team_a_id, team_b_id)')
      .eq('player_id', user!.id),

    supabase
      .from('matches')
      .select(`id, sport, status, team_a_name, team_b_name, winner_team_id, team_a_id, team_b_id, played_at,
        match_scores(team_name, runs, wickets, overs_faced, goals, sets),
        player_match_stats(player_id, runs_scored, wickets_taken, catches_taken, goals_scored, profiles(id, name))`)
      .neq('status', 'upcoming')
      .order('played_at', { ascending: false })
      .limit(15),

    supabase
      .from('matches')
      .select('id, sport, team_a_name, team_b_name, match_scores(team_name, runs, wickets, goals)')
      .eq('status', 'live')
      .limit(5),
  ]);

  const athleteData = buildAthleteData(
    profile ?? { id: user!.id, name: 'Player', avatar_url: null, created_at: new Date().toISOString() },
    (myStats ?? []) as unknown as Parameters<typeof buildAthleteData>[1]
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const feedMatches = (rawFeed ?? []).map((m: any) => ({
    ...m,
    player_performances: (m.player_match_stats ?? []).map((s: { player_id: string; runs_scored: number; wickets_taken: number; catches_taken: number; goals_scored: number; profiles: { id: string; name: string } | null }) => ({
      player_id: s.player_id,
      name: s.profiles?.name ?? 'Unknown',
      runs_scored: s.runs_scored,
      wickets_taken: s.wickets_taken,
      catches_taken: s.catches_taken,
      goals_scored: s.goals_scored,
    })),
  }));

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">

      {/* Your athlete card — the hero */}
      <AthleteCard
        athlete={athleteData}
        isOwn
        editSlot={<AvatarUpload userId={user!.id} />}
      />

      {/* New match CTA */}
      <div className="flex gap-2">
        {[
          { href: '/matches/new?sport=cricket', emoji: '🏏', label: 'Cricket' },
          { href: '/matches/new?sport=football', emoji: '⚽', label: 'Football' },
          { href: '/matches/new?sport=badminton', emoji: '🏸', label: 'Badminton' },
        ].map(({ href, emoji, label }) => (
          <Link key={label} href={href}
            className="flex-1 flex items-center justify-center gap-1.5 bg-gray-900 border border-gray-800 hover:border-emerald-700 hover:bg-emerald-950/20 rounded-xl py-2.5 text-sm text-gray-400 hover:text-emerald-400 font-medium transition-all">
            <span>{emoji}</span> + {label}
          </Link>
        ))}
      </div>

      {/* Live now */}
      {liveMatches && liveMatches.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <h2 className="text-sm font-semibold text-white">Live Now</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(liveMatches as any[]).map(m => {
              const sA = m.match_scores?.find((s: { team_name: string }) => s.team_name === m.team_a_name);
              const sB = m.match_scores?.find((s: { team_name: string }) => s.team_name === m.team_b_name);
              const emoji = m.sport === 'cricket' ? '🏏' : m.sport === 'football' ? '⚽' : '🏸';
              return (
                <Link key={m.id} href={`/matches/${m.id}`}
                  className="flex-shrink-0 bg-red-950/30 border border-red-900/50 rounded-2xl p-3 w-44 hover:border-red-700 transition-colors">
                  <p className="text-xs text-red-400 font-semibold mb-2">{emoji} LIVE</p>
                  <p className="text-xs text-gray-300 truncate">{m.team_a_name}</p>
                  <p className="text-lg font-bold text-white">{m.sport === 'cricket' ? `${sA?.runs ?? 0}/${sA?.wickets ?? 0}` : sA?.goals ?? 0}</p>
                  <p className="text-xs text-gray-600 my-0.5">vs</p>
                  <p className="text-xs text-gray-300 truncate">{m.team_b_name}</p>
                  <p className="text-lg font-bold text-white">{m.sport === 'cricket' ? `${sB?.runs ?? 0}/${sB?.wickets ?? 0}` : sB?.goals ?? 0}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity feed */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">Recent Matches</h2>
          <Link href="/matches" className="text-xs text-emerald-400 hover:underline">View all</Link>
        </div>
        {feedMatches.length > 0 ? (
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {feedMatches.map((m: any) => <FeedMatchCard key={m.id} match={m} />)}
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
            <p className="text-3xl mb-2">🏟️</p>
            <p className="text-gray-500 text-sm">Play your first match to start building your profile</p>
            <Link href="/matches/new"
              className="inline-flex items-center gap-1.5 mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-semibold">
              <Plus size={14} /> New Match
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
