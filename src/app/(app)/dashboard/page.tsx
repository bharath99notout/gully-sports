import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import AthleteCard from '@/components/AthleteCard';
import AvatarUpload from '@/components/AvatarUpload';
import FeedMatchCard from '@/components/FeedMatchCard';
import { buildAthleteData, enrichStatsWithTeamNames } from '@/lib/athleteData';
import TrophyBanner, { Achievement } from '@/components/TrophyBanner';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch profile + stats + match_players (for win attribution)
  const [{ data: profile }, { data: myStats }, { data: myMatchPlayers }] = await Promise.all([
    supabase.from('profiles').select('id, name, avatar_url, created_at').eq('id', user!.id).single(),
    supabase
      .from('player_match_stats')
      .select('sport, runs_scored, wickets_taken, catches_taken, goals_scored, match_id, matches(winner_team_id, winner_team_name, team_a_id, team_b_id, team_a_name, team_b_name)')
      .eq('player_id', user!.id),
    supabase
      .from('match_players')
      .select('match_id, team_name')
      .eq('player_id', user!.id),
  ]);

  // Only fetch matches the user actually played in
  const myMatchIds = [...new Set((myStats ?? []).map(s => s.match_id))];

  const [{ data: rawFeed }, { data: liveMatches }] = await Promise.all([
    myMatchIds.length > 0
      ? supabase
          .from('matches')
          .select(`id, sport, status, team_a_name, team_b_name, winner_team_id, winner_team_name, team_a_id, team_b_id, played_at,
            match_scores(team_name, runs, wickets, overs_faced, goals, sets),
            player_match_stats(player_id, runs_scored, wickets_taken, catches_taken, goals_scored, profiles(id, name))`)
          .in('id', myMatchIds)
          .neq('status', 'upcoming')
          .order('played_at', { ascending: false })
          .limit(15)
      : Promise.resolve({ data: [] }),

    myMatchIds.length > 0
      ? supabase
          .from('matches')
          .select('id, sport, team_a_name, team_b_name, match_scores(team_name, runs, wickets, goals)')
          .in('id', myMatchIds)
          .eq('status', 'live')
          .limit(5)
      : Promise.resolve({ data: [] }),
  ]);

  const enrichedStats = enrichStatsWithTeamNames(
    (myStats ?? []) as unknown as Parameters<typeof enrichStatsWithTeamNames>[0],
    (myMatchPlayers ?? []) as Array<{ match_id: string; team_name: string }>,
  );

  const athleteData = buildAthleteData(
    profile ?? { id: user!.id, name: 'Player', avatar_url: null, created_at: new Date().toISOString() },
    enrichedStats
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

  const firstName = profile?.name?.trim().split(' ')[0] || 'Player';

  // Compute per-match achievements for trophy banners
  const achievements: Achievement[] = [];
  const impactScore = (p: { runs_scored: number; wickets_taken: number; catches_taken: number }) =>
    (p.runs_scored ?? 0) + (p.wickets_taken ?? 0) * 20 + (p.catches_taken ?? 0) * 10;

  for (const stat of myStats ?? []) {
    const mid = stat.match_id;
    if ((stat.runs_scored ?? 0) >= 100)
      achievements.push({ id: `century_${mid}`, emoji: '💯', title: 'Century!', subtitle: `${stat.runs_scored} runs`, color: 'gold' });
    else if ((stat.runs_scored ?? 0) >= 50)
      achievements.push({ id: `fifty_${mid}`, emoji: '⚡', title: 'Half-Century!', subtitle: `${stat.runs_scored} runs`, color: 'emerald' });

    if ((stat.wickets_taken ?? 0) >= 10)
      achievements.push({ id: `10wkt_${mid}`, emoji: '🏆', title: 'Bowling Legend!', subtitle: `${stat.wickets_taken} wickets`, color: 'gold' });
    else if ((stat.wickets_taken ?? 0) >= 5)
      achievements.push({ id: `5wkt_${mid}`, emoji: '🔥', title: '5-Wicket Haul!', subtitle: `${stat.wickets_taken} wickets`, color: 'red' });
    else if ((stat.wickets_taken ?? 0) >= 3)
      achievements.push({ id: `3wkt_${mid}`, emoji: '🎯', title: 'Hat-Trick Hero!', subtitle: `${stat.wickets_taken} wickets`, color: 'blue' });

    if ((stat.catches_taken ?? 0) >= 3)
      achievements.push({ id: `catches_${mid}`, emoji: '🧤', title: 'Catch Master!', subtitle: `${stat.catches_taken} catches`, color: 'emerald' });

    if ((stat.goals_scored ?? 0) >= 5)
      achievements.push({ id: `goals_${mid}`, emoji: '⚽', title: 'Goal Fest!', subtitle: `${stat.goals_scored} goals`, color: 'blue' });
  }

  // MVP: highest impact player in each completed match
  for (const match of feedMatches) {
    if (match.status !== 'completed') continue;
    const perfs: { player_id: string; runs_scored: number; wickets_taken: number; catches_taken: number }[] =
      match.player_performances ?? [];
    if (perfs.length === 0) continue;
    const sorted = [...perfs].sort((a, b) => impactScore(b) - impactScore(a));
    if (sorted[0]?.player_id === user!.id && impactScore(sorted[0]) > 0)
      achievements.push({ id: `mvp_${match.id}`, emoji: '🥇', title: 'Match MVP!', subtitle: `${match.team_a_name} vs ${match.team_b_name}`, color: 'gold' });
  }

  // Badminton / Table Tennis: award match-win trophies
  const myTeamByMatch = new Map<string, string>();
  for (const mp of myMatchPlayers ?? []) myTeamByMatch.set(mp.match_id, mp.team_name);
  for (const stat of myStats ?? []) {
    if (stat.sport !== 'badminton' && stat.sport !== 'table_tennis') continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = (stat as any).matches as { winner_team_name?: string | null } | null;
    const playerTeam = myTeamByMatch.get(stat.match_id);
    if (!m?.winner_team_name || !playerTeam || m.winner_team_name !== playerTeam) continue;

    if (stat.sport === 'badminton') {
      achievements.push({ id: `bmn_win_${stat.match_id}`, emoji: '🏸', title: 'Badminton Win!', subtitle: 'You won the match', color: 'emerald' });
    } else {
      achievements.push({ id: `tt_win_${stat.match_id}`, emoji: '🏓', title: 'Table Tennis Win!', subtitle: 'You won the match', color: 'emerald' });
    }
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">

      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-white">Hey, {firstName} 👋</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your player profile</p>
      </div>

      {/* Trophy notifications */}
      {achievements.length > 0 && <TrophyBanner achievements={achievements} />}

      {/* Athlete card hero */}
      <AthleteCard
        athlete={athleteData}
        isOwn
        editSlot={<AvatarUpload userId={user!.id} />}
      />

      {/* New match CTA */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { href: '/matches/new?sport=cricket',      emoji: '🏏', label: 'Cricket' },
          { href: '/matches/new?sport=football',     emoji: '⚽', label: 'Football' },
          { href: '/matches/new?sport=badminton',    emoji: '🏸', label: 'Badminton' },
          { href: '/matches/new?sport=table_tennis', emoji: '🏓', label: 'T. Tennis' },
        ].map(({ href, emoji, label }) => (
          <Link key={label} href={href}
            className="flex items-center justify-center gap-1.5 bg-gray-900 border border-gray-800 hover:border-emerald-700 hover:bg-emerald-950/20 rounded-xl py-2.5 text-sm text-gray-400 hover:text-emerald-400 font-medium transition-all">
            <span>{emoji}</span> + {label}
          </Link>
        ))}
      </div>

      {/* Live now — only user's live matches */}
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

      {/* Recent matches — only user's matches */}
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
