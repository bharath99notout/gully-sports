import { createClient } from '@/lib/supabase/server';
import { Search } from 'lucide-react';
import { AthleteCardMini } from '@/components/AthleteCard';
import { buildAthleteData, enrichStatsWithTeamNames } from '@/lib/athleteData';

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('profiles')
    .select(`
      id, name, avatar_url, created_at,
      player_match_stats(sport, runs_scored, wickets_taken, catches_taken, goals_scored, match_id, matches(winner_team_id, winner_team_name, team_a_id, team_b_id, team_a_name, team_b_name))
    `)
    .order('created_at', { ascending: false });

  if (q) query = query.ilike('name', `%${q}%`);

  const { data: players } = await query.limit(50);

  // Bulk-fetch match_players.team_name for every listed player so we can
  // attribute wins correctly in ad-hoc matches (no team UUIDs).
  const playerIds = (players ?? []).map(p => p.id);
  const teamByPlayerMatch = new Map<string, string>(); // `${player_id}__${match_id}` → team_name
  if (playerIds.length > 0) {
    const { data: mp } = await supabase
      .from('match_players')
      .select('match_id, player_id, team_name')
      .in('player_id', playerIds);
    for (const row of mp ?? []) {
      teamByPlayerMatch.set(`${row.player_id}__${row.match_id}`, row.team_name);
    }
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Players</h1>
        <p className="text-sm text-gray-500 mt-0.5">Discover athletes on GullySports</p>
      </div>

      <form method="GET" className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search players…"
          className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </form>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {(players ?? []).map((p) => {
          // Enrich each player's stats with their team_name per match
          const rawStats = (p.player_match_stats ?? []) as Array<{ match_id: string }>;
          const mpForThisPlayer = rawStats.map(s => ({
            match_id: s.match_id,
            team_name: teamByPlayerMatch.get(`${p.id}__${s.match_id}`) ?? '',
          }));
          const enriched = enrichStatsWithTeamNames(
            rawStats as unknown as Parameters<typeof enrichStatsWithTeamNames>[0],
            mpForThisPlayer,
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const athleteData = buildAthleteData(p as any, enriched);
          return <AthleteCardMini key={p.id} athlete={athleteData} />;
        })}
      </div>

      {players?.length === 0 && (
        <div className="text-center py-12 text-gray-600">No players found.</div>
      )}
    </div>
  );
}
