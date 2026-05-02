'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import PlayerSearchAndAdd, { type PlayerAddResult } from '@/components/PlayerSearchAndAdd';

/**
 * Team-page roster add. Defers all search/create UI to PlayerSearchAndAdd
 * (the single source of truth for "find or create a player"). This wrapper
 * just owns the side-effect: insert into team_members.
 */
export default function AddPlayerForm({
  teamId,
  existingPlayerIds = [],
}: {
  teamId: string;
  existingPlayerIds?: string[];
}) {
  const router = useRouter();

  async function addToTeam(playerId: string): Promise<PlayerAddResult> {
    const supabase = createClient();
    const { error } = await supabase
      .from('team_members')
      .insert({ team_id: teamId, player_id: playerId });
    if (error) {
      const msg = error.message.toLowerCase();
      if (error.code === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
        return { ok: false, error: 'Player is already on this team.' };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }

  return (
    <PlayerSearchAndAdd
      onAdd={addToTeam}
      excludePlayerIds={existingPlayerIds}
      heading="Add player"
      hint="Search by name or 10-digit phone. Create a new player if not found — phone numbers are never duplicated."
      onSuccess={() => router.refresh()}
    />
  );
}
