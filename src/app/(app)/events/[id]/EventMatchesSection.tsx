import Link from 'next/link';
import { Plus, Activity } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { buildEventLeaderboard } from '@/lib/eventLeaderboardServer';
import EventLeaderboard from '@/components/EventLeaderboard';
import type { SportType } from '@/types';
import type { SportKey } from '@/lib/caliber';

interface Props {
  eventId: string;
  sport: SportType;
  isHost: boolean;
}

interface MatchRow {
  id: string;
  status: string;
  team_a_name: string;
  team_b_name: string;
  winner_team_name: string | null;
  played_at: string;
}

/**
 * Server-rendered. Lists matches linked to this event and renders a
 * per-event leaderboard using the SAME caliber + career-points layout as
 * the global `/leaderboard` (medals, avatars, skill / points toggle). For
 * set sports (badminton, table_tennis) it splits into Singles / Doubles
 * tabs based on per-match team-size — same heuristic the global feed uses.
 */
export default async function EventMatchesSection({ eventId, sport, isHost }: Props) {
  const supabase = await createClient();

  // Match list for the "Matches" sub-section (separate from the
  // leaderboard query — the leaderboard fetches its own stats join).
  const { data: links } = await supabase
    .from('event_matches')
    .select('match_id')
    .eq('event_id', eventId);
  const matchIds = (links ?? []).map(l => l.match_id);

  let matches: MatchRow[] = [];
  if (matchIds.length > 0) {
    const { data: matchRows } = await supabase
      .from('matches')
      .select('id, status, team_a_name, team_b_name, winner_team_name, played_at')
      .in('id', matchIds)
      .order('played_at', { ascending: false });
    matches = ((matchRows ?? []) as unknown as MatchRow[]).map(m => ({
      id: m.id, status: m.status,
      team_a_name: m.team_a_name, team_b_name: m.team_b_name,
      winner_team_name: m.winner_team_name, played_at: m.played_at,
    }));
  }

  // Per-event leaderboard — uses the same caliber + points logic as global.
  const leaderboard = await buildEventLeaderboard(eventId, sport as SportKey);

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-white">Matches &amp; leaderboard</h2>
        </div>
        {isHost && (
          <Link
            href={`/matches/new?event_id=${eventId}`}
            className="inline-flex items-center gap-1 bg-emerald-700/30 hover:bg-emerald-700/50 text-emerald-200 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-emerald-800/60"
          >
            <Plus size={12} /> Score a match
          </Link>
        )}
      </div>

      {matches.length === 0 ? (
        <p className="text-xs text-gray-500 italic">
          No matches yet. {isHost ? 'Tap "Score a match" to start one.' : 'The host will start a match when play begins.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {matches.map(m => (
            <li key={m.id}>
              <Link
                href={`/matches/${m.id}`}
                className="flex items-center justify-between gap-2 py-2 px-2 -mx-2 rounded-lg hover:bg-gray-800/60 transition-colors"
              >
                <span className="text-sm text-white truncate">
                  {m.team_a_name} <span className="text-gray-600">vs</span> {m.team_b_name}
                </span>
                <span className="text-[11px] uppercase tracking-wider shrink-0">
                  {m.status === 'completed' && m.winner_team_name ? (
                    <span className="text-emerald-400">{m.winner_team_name} won</span>
                  ) : m.status === 'live' ? (
                    <span className="text-emerald-300 animate-pulse">● live</span>
                  ) : (
                    <span className="text-gray-500">{m.status}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {matches.length > 0 && (
        <div className="pt-3 border-t border-gray-800 flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Leaderboard</h3>
          <EventLeaderboard
            sport={sport as SportKey}
            main={leaderboard.main}
            singles={leaderboard.singles}
            doubles={leaderboard.doubles}
          />
        </div>
      )}
    </section>
  );
}
