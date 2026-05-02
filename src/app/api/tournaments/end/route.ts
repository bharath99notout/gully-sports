import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { aggregatePlayers, awardsSnapshot, type RawTournamentStat } from '@/lib/tournament';
import type { SportType } from '@/types';

/**
 * Finalize a tournament: snapshot current leaderboards into tournament_awards
 * (so they can never be retroactively changed), then mark status=completed.
 *
 * Only the tournament's creator can call this. Idempotent: re-running on a
 * completed tournament re-issues the same award rows (we delete-then-insert).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  let body: { tournament_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const tid = String(body.tournament_id ?? '');
  if (!tid) {
    return NextResponse.json({ error: 'Missing tournament_id' }, { status: 400 });
  }

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, sport, created_by, status')
    .eq('id', tid)
    .maybeSingle();

  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
  }
  if (tournament.created_by !== user.id) {
    return NextResponse.json({ error: 'Only the organizer can end this tournament' }, { status: 403 });
  }

  // Pull all stats in this tournament's matches
  type MatchPlayerRow = { player_id: string; team_name: string };
  type StatRow = {
    player_id: string;
    runs_scored: number;
    wickets_taken: number;
    catches_taken: number;
    goals_scored: number;
    points_won: number;
    profiles: { name: string } | { name: string }[] | null;
  };
  type MatchRow = {
    id: string;
    winner_team_name: string | null;
    match_players: MatchPlayerRow[];
    player_match_stats: StatRow[];
  };

  const { data: matches } = await supabase
    .from('matches')
    .select('id, winner_team_name, match_players(player_id, team_name), player_match_stats(player_id, runs_scored, wickets_taken, catches_taken, goals_scored, points_won, profiles(name))')
    .eq('tournament_id', tid);

  const rawStats: RawTournamentStat[] = [];
  for (const m of (matches ?? []) as MatchRow[]) {
    const playerTeamMap = new Map<string, string>();
    for (const mp of m.match_players ?? []) playerTeamMap.set(mp.player_id, mp.team_name);

    for (const s of m.player_match_stats ?? []) {
      const prof = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
      rawStats.push({
        player_id: s.player_id,
        player_name: prof?.name ?? 'Unknown',
        match_id: m.id,
        team_name: playerTeamMap.get(s.player_id) ?? '',
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
  const snapshot = awardsSnapshot(aggregates, tournament.sport as SportType);

  // Delete prior award rows then insert fresh — idempotent + safe re-run.
  await supabase.from('tournament_awards').delete().eq('tournament_id', tid);

  if (snapshot.length > 0) {
    const rows = snapshot.map(s => ({
      tournament_id: tid,
      award_type: s.award_type,
      player_id: s.player_id,
      display_value: s.display_value,
    }));
    const { error: insertErr } = await supabase.from('tournament_awards').insert(rows);
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }

  const { error: updateErr } = await supabase
    .from('tournaments')
    .update({ status: 'completed' })
    .eq('id', tid);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, awards_count: snapshot.length });
}
