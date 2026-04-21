import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus, Calendar } from 'lucide-react';
import Card from '@/components/ui/Card';
import SportBadge from '@/components/SportBadge';
import { Match, SportType } from '@/types';

const statusLabel: Record<string, string> = {
  live: '● LIVE',
  upcoming: 'UPCOMING',
  completed: 'COMPLETED',
};

const statusClass: Record<string, string> = {
  live: 'bg-red-900/50 text-red-400 border-red-800',
  upcoming: 'bg-blue-900/50 text-blue-400 border-blue-800',
  completed: 'bg-gray-800 text-gray-400 border-gray-700',
};

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string; status?: string }>;
}) {
  const { sport, status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('matches')
    .select('*, match_scores(*)')
    .order('played_at', { ascending: false });

  if (sport) query = query.eq('sport', sport);
  if (status) query = query.eq('status', status);

  const { data: matches } = await query;

  const sports: { value: SportType; emoji: string }[] = [
    { value: 'cricket', emoji: '🏏' },
    { value: 'football', emoji: '⚽' },
    { value: 'badminton', emoji: '🏸' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Matches</h1>
        <Link
          href="/matches/new"
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          New Match
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/matches"
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!sport && !status ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}
        >
          All
        </Link>
        {sports.map(s => (
          <Link
            key={s.value}
            href={`/matches?sport=${s.value}`}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${sport === s.value ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}
          >
            {s.emoji} {s.value}
          </Link>
        ))}
        {['live', 'upcoming', 'completed'].map(st => (
          <Link
            key={st}
            href={`/matches?status=${st}`}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${status === st ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}
          >
            {st}
          </Link>
        ))}
      </div>

      {/* Match list */}
      {matches && matches.length > 0 ? (
        <div className="flex flex-col gap-2">
          {matches.map((match: Match) => (
            <Link key={match.id} href={`/matches/${match.id}`}>
              <Card padding="sm" className="hover:border-gray-700 transition-colors cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <SportBadge sport={match.sport} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {match.team_a_name} vs {match.team_b_name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(match.played_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium border flex-shrink-0 ${statusClass[match.status]}`}>
                    {statusLabel[match.status]}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card padding="lg" className="text-center py-12">
          <Calendar size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No matches found</p>
          <Link href="/matches/new" className="text-emerald-400 text-sm hover:underline mt-2 inline-block">
            Create a match →
          </Link>
        </Card>
      )}
    </div>
  );
}
