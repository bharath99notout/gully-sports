import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import FeedMatchCard from '@/components/FeedMatchCard';
import AthleteCard from '@/components/AthleteCard';
import { buildAthleteData, enrichStatsWithTeamNames } from '@/lib/athleteData';

interface Props { params: Promise<{ id: string }> }

export default async function PublicPlayerPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

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
      .limit(15),

    supabase
      .from('match_players')
      .select('match_id, team_name')
      .eq('player_id', id),
  ]);

  if (!profile) notFound();

  const enrichedStats = enrichStatsWithTeamNames(
    (allStats ?? []) as unknown as Parameters<typeof enrichStatsWithTeamNames>[0],
    (myMatchPlayers ?? []) as Array<{ match_id: string; team_name: string }>,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const athleteData = buildAthleteData(profile as any, enrichedStats);

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

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">

      <AthleteCard athlete={athleteData} />

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
