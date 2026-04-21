import { createClient } from '@/lib/supabase/server';
import { Search } from 'lucide-react';
import { AthleteCardMini } from '@/components/AthleteCard';
import { buildAthleteData } from '@/lib/athleteData';

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
      player_match_stats(sport, runs_scored, wickets_taken, catches_taken, goals_scored, match_id, matches(winner_team_id, team_a_id, team_b_id))
    `)
    .order('created_at', { ascending: false });

  if (q) query = query.ilike('name', `%${q}%`);

  const { data: players } = await query.limit(50);

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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const athleteData = buildAthleteData(p as any, (p.player_match_stats ?? []) as any);
          return <AthleteCardMini key={p.id} athlete={athleteData} />;
        })}
      </div>

      {players?.length === 0 && (
        <div className="text-center py-12 text-gray-600">No players found.</div>
      )}
    </div>
  );
}
