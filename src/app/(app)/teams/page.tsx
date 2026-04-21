import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus, Users } from 'lucide-react';
import Card from '@/components/ui/Card';
import SportBadge from '@/components/SportBadge';
import { Team } from '@/types';

export default async function TeamsPage() {
  const supabase = await createClient();
  const { data: teams } = await supabase
    .from('teams')
    .select('*, team_members(count)')
    .order('created_at', { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Teams</h1>
        <Link
          href="/teams/new"
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          New Team
        </Link>
      </div>

      {teams && teams.length > 0 ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {teams.map((team: Team & { team_members: { count: number }[] }) => (
            <Link key={team.id} href={`/teams/${team.id}`}>
              <Card className="hover:border-gray-700 transition-colors cursor-pointer h-full">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-white text-lg">{team.name}</h3>
                  <SportBadge sport={team.sport} />
                </div>
                <div className="flex items-center gap-1.5 text-sm text-gray-400">
                  <Users size={14} />
                  <span>{team.team_members?.[0]?.count ?? 0} players</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card padding="lg" className="text-center py-12">
          <Users size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No teams yet</p>
          <p className="text-gray-600 text-sm mt-1">Create a team to get started</p>
          <Link
            href="/teams/new"
            className="inline-flex items-center gap-2 mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Create Team
          </Link>
        </Card>
      )}
    </div>
  );
}
