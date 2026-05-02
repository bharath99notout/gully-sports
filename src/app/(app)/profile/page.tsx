import { createClient } from '@/lib/supabase/server';
import AthleteCard from '@/components/AthleteCard';
import AvatarUpload from '@/components/AvatarUpload';
import EditProfileForm from './EditProfileForm';
import EmailOtpSection from './EmailOtpSection';
import FeedMatchCard from '@/components/FeedMatchCard';
import { buildAthleteData, enrichStatsWithTeamNames } from '@/lib/athleteData';

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: profile }, { data: allStats }, { data: rawMatches }, { data: myMatchPlayers }] = await Promise.all([
    supabase.from('profiles').select('id, name, avatar_url, phone, created_at, email_otp_enabled').eq('id', user!.id).single(),

    supabase
      .from('player_match_stats')
      .select('sport, runs_scored, wickets_taken, catches_taken, goals_scored, match_id, matches(winner_team_id, winner_team_name, team_a_id, team_b_id, team_a_name, team_b_name, confirmation_state)')
      .eq('player_id', user!.id),

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
      .limit(10),

    supabase
      .from('match_players')
      .select('match_id, team_name')
      .eq('player_id', user!.id),
  ]);

  const enrichedStats = enrichStatsWithTeamNames(
    (allStats ?? []) as unknown as Parameters<typeof enrichStatsWithTeamNames>[0],
    (myMatchPlayers ?? []) as Array<{ match_id: string; team_name: string }>,
  );

  const athleteData = buildAthleteData(
    profile ?? { id: user!.id, name: 'Player', avatar_url: null, created_at: new Date().toISOString() },
    enrichedStats
  );

  const feedMatches = (rawMatches ?? []).map((m: Record<string, unknown>) => ({
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

      <AthleteCard
        athlete={athleteData}
        isOwn
        editSlot={<AvatarUpload userId={user!.id} />}
      />

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Profile &amp; sign-in</h2>
        <EditProfileForm profile={profile} />
        <EmailOtpSection
          currentEmail={
            user?.email && !user.email.toLowerCase().endsWith('@live.com')
              ? user.email
              : ''
          }
          enabled={Boolean((profile as { email_otp_enabled?: boolean } | null)?.email_otp_enabled)}
        />
      </div>

      {feedMatches.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-white mb-3">My Matches</h2>
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {feedMatches.map((m: any) => <FeedMatchCard key={m.id} match={m} />)}
          </div>
        </div>
      )}

    </div>
  );
}
