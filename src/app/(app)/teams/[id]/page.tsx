import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import SportBadge from '@/components/SportBadge';
import Card from '@/components/ui/Card';
import AddPlayerForm from './AddPlayerForm';
import RemovePlayerButton from './RemovePlayerButton';
import JoinTournamentSection from './JoinTournamentSection';
import { Users } from 'lucide-react';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TeamDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: team } = await supabase
    .from('teams')
    .select('*, team_members(id, player_id, profiles(id, name, phone))')
    .eq('id', id)
    .single();

  if (!team) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  const isOwner = user?.id === team.created_by;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{team.name}</h1>
          <div className="mt-1">
            <SportBadge sport={team.sport} />
          </div>
        </div>
      </div>

      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Users size={18} className="text-gray-400" />
          <h2 className="font-semibold text-white">
            Players ({team.team_members?.length ?? 0})
          </h2>
        </div>

        {team.team_members && team.team_members.length > 0 ? (
          <div className="flex flex-col gap-2">
            {team.team_members.map((member: { id: string; player_id: string; profiles: { id: string; name: string } }) => (
              <div key={member.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <div>
                  <p className="text-white text-sm font-medium">{member.profiles?.name ?? 'Unknown'}</p>
                </div>
                {isOwner && (
                  <RemovePlayerButton memberId={member.id} teamId={team.id} />
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No players added yet.</p>
        )}

        {isOwner && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <AddPlayerForm
              teamId={team.id}
              existingPlayerIds={(team.team_members ?? []).map((m: { player_id: string }) => m.player_id)}
            />
          </div>
        )}
      </Card>

      {isOwner && <JoinTournamentSection teamId={team.id} teamSport={team.sport} />}
    </div>
  );
}
