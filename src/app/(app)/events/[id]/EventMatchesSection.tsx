import Link from 'next/link';
import { Plus, Activity } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  aggregatePlayers,
  leaderboardsFor,
  type RawTournamentStat,
} from '@/lib/tournament';
import Leaderboard from '@/components/Leaderboard';
import type { SportType } from '@/types';

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
 * per-event leaderboard using the same component as tournaments.
 */
export default async function EventMatchesSection({ eventId, sport, isHost }: Props) {
  const supabase = await createClient();

  // Pull match IDs linked to this event.
  const { data: links } = await supabase
    .from('event_matches')
    .select('match_id')
    .eq('event_id', eventId);
  const matchIds = (links ?? []).map(l => l.match_id);

  let matches: MatchRow[] = [];
  let aggregates: ReturnType<typeof aggregatePlayers> = [];
  let leaderboards = leaderboardsFor([], sport);

  if (matchIds.length > 0) {
    const { data: matchRows } = await supabase
      .from('matches')
      .select('id, status, team_a_name, team_b_name, winner_team_name, played_at, player_match_stats(player_id, runs_scored, wickets_taken, catches_taken, goals_scored, points_won, balls_faced, fours, sixes, balls_bowled, runs_conceded, profiles(id, name)), match_players(player_id, team_name)')
      .in('id', matchIds)
      .order('played_at', { ascending: false });

    matches = ((matchRows ?? []) as unknown as MatchRow[]).map(m => ({
      id: m.id, status: m.status,
      team_a_name: m.team_a_name, team_b_name: m.team_b_name,
      winner_team_name: m.winner_team_name, played_at: m.played_at,
    }));

    // Build raw stats for aggregation (mirrors the tournament page).
    const rawStats: RawTournamentStat[] = [];
    type StatRow = {
      player_id: string;
      runs_scored: number | null; wickets_taken: number | null; catches_taken: number | null;
      goals_scored: number | null; points_won: number | null;
      balls_faced: number | null; fours: number | null; sixes: number | null;
      balls_bowled: number | null; runs_conceded: number | null;
      profiles: { id: string; name: string } | { id: string; name: string }[] | null;
    };
    type MatchPlayerRow = { player_id: string; team_name: string };
    type MatchWithEmbeds = MatchRow & {
      player_match_stats: StatRow[] | null;
      match_players: MatchPlayerRow[] | null;
    };
    for (const m of (matchRows ?? []) as unknown as MatchWithEmbeds[]) {
      const playerTeam = new Map<string, string>();
      for (const mp of (m.match_players ?? [])) playerTeamMapSet(playerTeam, mp);
      for (const s of (m.player_match_stats ?? [])) {
        const prof = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
        rawStats.push({
          player_id: s.player_id,
          player_name: prof?.name ?? 'Unknown',
          match_id: m.id,
          team_name: playerTeam.get(s.player_id) ?? '',
          runs_scored: s.runs_scored ?? 0,
          wickets_taken: s.wickets_taken ?? 0,
          catches_taken: s.catches_taken ?? 0,
          goals_scored: s.goals_scored ?? 0,
          points_won: s.points_won ?? 0,
          balls_faced: s.balls_faced ?? 0,
          fours: s.fours ?? 0,
          sixes: s.sixes ?? 0,
          balls_bowled: s.balls_bowled ?? 0,
          runs_conceded: s.runs_conceded ?? 0,
          match_winner_team_name: m.winner_team_name,
        });
      }
    }
    aggregates = aggregatePlayers(rawStats, sport);
    leaderboards = leaderboardsFor(aggregates, sport);
  }

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-white">Matches & leaderboard</h2>
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

      {/* Per-event leaderboard — same component as tournament leaderboard */}
      {matches.length > 0 && (
        <div className="pt-3 border-t border-gray-800 flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Leaderboard</h3>
          <Leaderboard sport={sport} aggregates={aggregates} leaderboards={leaderboards} />
        </div>
      )}
    </section>
  );
}

function playerTeamMapSet(map: Map<string, string>, mp: { player_id: string; team_name: string }) {
  map.set(mp.player_id, mp.team_name);
}
