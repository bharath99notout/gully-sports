'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import { Match } from '@/types';

export default function MatchControls({ match }: { match: Match }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function updateStatus(status: 'live' | 'completed') {
    setLoading(true);
    const supabase = createClient();
    await supabase.from('matches').update({ status }).eq('id', match.id);
    router.refresh();
    setLoading(false);
  }

  async function declareWinner(teamId: string | undefined) {
    if (!teamId) return;
    setLoading(true);
    const supabase = createClient();
    await supabase.from('matches').update({ winner_team_id: teamId, status: 'completed' }).eq('id', match.id);
    router.refresh();
    setLoading(false);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {match.status === 'upcoming' && (
        <Button size="sm" onClick={() => updateStatus('live')} loading={loading}>
          Start Match
        </Button>
      )}
      {match.status === 'live' && (
        <div className="flex flex-col gap-1 items-end">
          <p className="text-xs text-gray-500">Declare winner:</p>
          <div className="flex gap-1">
            <Button size="sm" onClick={() => declareWinner(match.team_a_id)} loading={loading} variant="secondary">
              {match.team_a_name}
            </Button>
            <Button size="sm" onClick={() => declareWinner(match.team_b_id)} loading={loading} variant="secondary">
              {match.team_b_name}
            </Button>
          </div>
          <button
            onClick={() => updateStatus('completed')}
            className="text-xs text-gray-600 hover:text-gray-400"
            disabled={loading}
          >
            End (no result)
          </button>
        </div>
      )}
    </div>
  );
}
