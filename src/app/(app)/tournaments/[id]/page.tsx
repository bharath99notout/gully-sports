import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  aggregatePlayers,
  awardsSnapshot,
  computeStandings,
  leaderboardsFor,
  mopOf,
  AWARD_LABELS,
  type RawTournamentStat,
  type RawMatchForStandings,
} from '@/lib/tournament';
import type { SportType } from '@/types';
import TournamentTabsClient from './TournamentTabsClient';

const SPORT_EMOJI: Record<string, string> = {
  cricket: '🏏', football: '⚽', badminton: '🏸', table_tennis: '🏓',
};

export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, sport, status, start_date, end_date, description, created_by, created_at')
    .eq('id', id)
    .maybeSingle();

  if (!tournament) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  const isOrganizer = user?.id === tournament.created_by;

  const [{ data: teamRows }, { data: rosterRowsRaw }, { data: matchRows }, { data: awardRowsRaw }] = await Promise.all([
    supabase
      .from('tournament_teams')
      .select('team_id, joined_at, teams(id, name, sport)')
      .eq('tournament_id', id),

    // NB: explicit two-step fetch (rows + profiles) instead of a Supabase auto-join.
    // The FK on tournament_team_players.player_id originally pointed at auth.users
    // and PostgREST silently returned null for the joined profiles, hiding all
    // roster rows from the UI. Migration 021 fixes the FK to point at profiles,
    // but this code path stays robust regardless.
    supabase
      .from('tournament_team_players')
      .select('team_id, player_id')
      .eq('tournament_id', id),

    supabase
      .from('matches')
      .select('id, status, played_at, team_a_id, team_a_name, team_b_id, team_b_name, winner_team_id, winner_team_name, player_match_stats(player_id, team_id, runs_scored, wickets_taken, catches_taken, goals_scored, points_won, profiles(id, name)), match_players(player_id, team_name, name)')
      .eq('tournament_id', id)
      .order('played_at', { ascending: false }),

    supabase
      .from('tournament_awards')
      .select('award_type, player_id, display_value')
      .eq('tournament_id', id),
  ]);

  // Resolve all referenced player profiles in a single batched query.
  const playerIds = Array.from(new Set([
    ...(rosterRowsRaw ?? []).map((r: { player_id: string }) => r.player_id),
    ...(awardRowsRaw ?? []).map((r: { player_id: string }) => r.player_id),
  ]));
  const { data: profileRows } = playerIds.length > 0
    ? await supabase.from('profiles').select('id, name, avatar_url').in('id', playerIds)
    : { data: [] as Array<{ id: string; name: string; avatar_url: string | null }> };
  const profileById = new Map(
    (profileRows ?? []).map((p: { id: string; name: string; avatar_url: string | null }) => [p.id, p])
  );

  const rosterRows = (rosterRowsRaw ?? []).map((r: { team_id: string; player_id: string }) => ({
    team_id: r.team_id,
    player_id: r.player_id,
    profile: profileById.get(r.player_id) ?? null,
  }));

  const awardRows = (awardRowsRaw ?? []).map((a: { award_type: string; player_id: string; display_value: string }) => ({
    award_type: a.award_type,
    player_id: a.player_id,
    display_value: a.display_value,
    profile: profileById.get(a.player_id) ?? null,
  }));

  // Build team display structures
  const teams = (teamRows ?? []).map((row: { team_id: string; teams: { id: string; name: string; sport: string } | { id: string; name: string; sport: string }[] | null }) => {
    const teamObj = Array.isArray(row.teams) ? row.teams[0] : row.teams;
    const players = rosterRows
      .filter(p => p.team_id === row.team_id)
      .map(p => ({
        id: p.player_id,
        name: p.profile?.name ?? 'Unknown',
        avatar_url: p.profile?.avatar_url ?? null,
      }));
    return { id: row.team_id, name: teamObj?.name ?? 'Team', players };
  });

  // Compute standings
  const standings = computeStandings(
    (matchRows ?? []).map((m: { team_a_id: string | null; team_a_name: string; team_b_id: string | null; team_b_name: string; winner_team_id: string | null; winner_team_name: string | null; status: string }): RawMatchForStandings => ({
      team_a_id: m.team_a_id, team_a_name: m.team_a_name,
      team_b_id: m.team_b_id, team_b_name: m.team_b_name,
      winner_team_id: m.winner_team_id, winner_team_name: m.winner_team_name,
      status: m.status,
    }))
  );

  // Build raw stats for leaderboard aggregation
  const rawStats: RawTournamentStat[] = [];
  for (const m of (matchRows ?? [])) {
    type MatchPlayerRow = { player_id: string; team_name: string; name: string };
    type StatRow = {
      player_id: string;
      team_id: string | null;
      runs_scored: number;
      wickets_taken: number;
      catches_taken: number;
      goals_scored: number;
      points_won: number;
      profiles: { id: string; name: string } | { id: string; name: string }[] | null;
    };
    const matchPlayers: MatchPlayerRow[] = (m.match_players as MatchPlayerRow[]) ?? [];
    const playerTeamMap = new Map<string, string>();
    for (const mp of matchPlayers) playerTeamMap.set(mp.player_id, mp.team_name);

    for (const s of ((m.player_match_stats as StatRow[]) ?? [])) {
      const prof = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
      const teamName = playerTeamMap.get(s.player_id) ?? '';
      rawStats.push({
        player_id: s.player_id,
        player_name: prof?.name ?? 'Unknown',
        match_id: m.id,
        team_name: teamName,
        runs_scored: s.runs_scored ?? 0,
        wickets_taken: s.wickets_taken ?? 0,
        catches_taken: s.catches_taken ?? 0,
        goals_scored: s.goals_scored ?? 0,
        points_won: s.points_won ?? 0,
        match_winner_team_name: m.winner_team_name,
      });
    }
  }

  const aggregates = aggregatePlayers(rawStats, tournament.sport as SportType);
  const leaderboards = leaderboardsFor(aggregates, tournament.sport as SportType);
  const liveMop = mopOf(aggregates);
  const liveAwardsSnapshot = awardsSnapshot(aggregates, tournament.sport as SportType);

  // Frozen awards (after End Tournament was clicked)
  const frozenAwards = awardRows.map(a => ({
    award_type: a.award_type,
    label: AWARD_LABELS[a.award_type] ?? a.award_type,
    player_id: a.player_id,
    player_name: a.profile?.name ?? 'Unknown',
    avatar_url: a.profile?.avatar_url ?? null,
    display_value: a.display_value,
  }));

  // For live leaderboard cards, attach award labels and projected MOP
  const liveAwards = liveAwardsSnapshot.map(a => {
    const agg = aggregates.find(x => x.player_id === a.player_id);
    return {
      award_type: a.award_type,
      label: AWARD_LABELS[a.award_type] ?? a.award_type,
      player_id: a.player_id,
      player_name: agg?.player_name ?? 'Unknown',
      display_value: a.display_value,
    };
  });

  const matches = (matchRows ?? []).map((m: { id: string; status: string; played_at: string; team_a_name: string; team_b_name: string; winner_team_name: string | null }) => ({
    id: m.id,
    status: m.status,
    played_at: m.played_at,
    team_a_name: m.team_a_name,
    team_b_name: m.team_b_name,
    winner_team_name: m.winner_team_name,
  }));

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Link href="/tournaments" className="text-xs text-gray-500 hover:text-gray-300">
          ← Tournaments
        </Link>
      </div>

      <header className="bg-gradient-to-br from-emerald-900/30 to-gray-900 border border-emerald-900/40 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <span className="text-3xl">{SPORT_EMOJI[tournament.sport]}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white leading-tight flex items-center gap-2">
              <Trophy size={18} className="text-emerald-400" />
              {tournament.name}
            </h1>
            <p className="text-xs text-gray-400 mt-1 capitalize">
              {tournament.sport.replace('_', ' ')} · league
              {tournament.start_date ? ` · ${tournament.start_date}` : ''}
              {tournament.end_date ? ` → ${tournament.end_date}` : ''}
            </p>
            {tournament.description ? (
              <p className="text-xs text-gray-300 mt-2">{tournament.description}</p>
            ) : null}
          </div>
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
            tournament.status === 'live'      ? 'bg-emerald-500/15 text-emerald-300'
          : tournament.status === 'completed' ? 'bg-gray-800 text-gray-400'
          :                                     'bg-blue-500/10 text-blue-300'
          }`}>
            {tournament.status}
          </span>
        </div>
      </header>

      <TournamentTabsClient
        tournament={{
          id: tournament.id,
          name: tournament.name,
          sport: tournament.sport,
          status: tournament.status,
        }}
        isOrganizer={isOrganizer}
        teams={teams}
        matches={matches}
        standings={standings}
        leaderboards={leaderboards}
        liveAwards={liveAwards}
        liveMop={liveMop}
        frozenAwards={frozenAwards}
      />
    </div>
  );
}
