'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import PlayerSearchAndAdd, { type PlayerAddResult } from '@/components/PlayerSearchAndAdd';

/**
 * Team-page roster add. Defers all search/create UI to PlayerSearchAndAdd.
 *
 * Side effects on add:
 *  1. Insert into team_members (the global team roster).
 *  2. Propagate the new player into every ACTIVE tournament this team is
 *     currently in — so adding a player to the team also adds them to
 *     ongoing competitions without a second step on the tournament page.
 *
 *     If the player is already on a DIFFERENT team in one of those
 *     tournaments, the unique constraint silently rejects that one
 *     insert (one-player-one-team-per-tournament rule). We don't fail
 *     the team add for it — the global roster operation succeeded; the
 *     conflict is reported back so the user knows which tournaments to
 *     sort out manually.
 *
 *     Removals are NOT propagated — the captain might want to keep a
 *     player's mid-tournament stats even after they leave the global team.
 */
export default function AddPlayerForm({
  teamId,
  existingPlayerIds = [],
}: {
  teamId: string;
  existingPlayerIds?: string[];
}) {
  const router = useRouter();

  async function addToTeam(playerId: string, displayName: string): Promise<PlayerAddResult> {
    const supabase = createClient();

    // 1. Global team roster
    const { error: tmErr } = await supabase
      .from('team_members')
      .insert({ team_id: teamId, player_id: playerId });
    if (tmErr) {
      const msg = tmErr.message.toLowerCase();
      if (tmErr.code === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
        return { ok: false, error: 'Player is already on this team.' };
      }
      return { ok: false, error: tmErr.message };
    }

    // 2. Propagate to active tournaments this team is in
    type TtRow = { tournament_id: string; tournaments: { id: string; name: string; status: string } | { id: string; name: string; status: string }[] | null };
    const { data: tts } = await supabase
      .from('tournament_teams')
      .select('tournament_id, tournaments(id, name, status)')
      .eq('team_id', teamId);

    const activeTournaments = ((tts ?? []) as TtRow[])
      .map(r => {
        const t = Array.isArray(r.tournaments) ? r.tournaments[0] : r.tournaments;
        return t;
      })
      .filter((t): t is { id: string; name: string; status: string } =>
        Boolean(t) && t!.status !== 'completed'
      );

    const skippedTournaments: string[] = [];
    for (const t of activeTournaments) {
      const { error: ttpErr } = await supabase
        .from('tournament_team_players')
        .insert({ tournament_id: t.id, team_id: teamId, player_id: playerId });
      if (ttpErr) {
        const m = ttpErr.message.toLowerCase();
        if (m.includes('duplicate') || m.includes('unique') || m.includes('23505')) {
          // Player is on another team in this tournament — the rule prevents adding here.
          skippedTournaments.push(t.name);
        }
        // Other errors: log but don't block the team add itself.
        else console.warn('[AddPlayer] tournament sync failed for', t.name, ttpErr.message);
      }
    }

    if (skippedTournaments.length > 0) {
      // Team add succeeded, but tournament auto-sync hit the
      // one-player-one-team rule in some tournaments. Surface as a soft
      // warning — the player IS on the team; only some tournament
      // propagations were blocked.
      return {
        ok: true,
        warning: `${displayName} added to the team. Skipped in ${skippedTournaments.length} tournament(s) where they're already on another team: ${skippedTournaments.join(', ')}.`,
      };
    }
    return { ok: true };
  }

  return (
    <PlayerSearchAndAdd
      onAdd={addToTeam}
      excludePlayerIds={existingPlayerIds}
      heading="Add player"
      hint="Search by name or 10-digit phone. Create new if not found — phone numbers are never duplicated. New player is auto-added to active tournaments this team is in."
      onSuccess={() => router.refresh()}
    />
  );
}
