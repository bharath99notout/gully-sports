import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import SportBadge from '@/components/SportBadge';
import CricketScorer from './CricketScorer';
import FootballScorer from './FootballScorer';
import BadmintonScorer from './BadmintonScorer';
import MatchControls from './MatchControls';
import { Match, MatchScore, MatchPlayer, CricketPlayerStat } from '@/types';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MatchDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: match } = await supabase
    .from('matches')
    .select('*, match_scores(*)')
    .eq('id', id)
    .single();

  if (!match) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  const canEdit = user?.id === match.created_by;

  const scores: MatchScore[] = match.match_scores ?? [];
  const scoreA = scores.find((s: MatchScore) => s.team_name === match.team_a_name) ?? null;
  const scoreB = scores.find((s: MatchScore) => s.team_name === match.team_b_name) ?? null;

  // Fetch match players (cricket + badminton)
  let matchPlayers: MatchPlayer[] = [];
  let playerStats: Record<string, CricketPlayerStat> = {};

  if (match.sport === 'badminton') {
    const { data: mp } = await supabase
      .from('match_players')
      .select('id, match_id, player_id, team_name, profiles(name)')
      .eq('match_id', id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    matchPlayers = (mp ?? []).map((p: any) => ({
      id: p.id,
      match_id: p.match_id,
      player_id: p.player_id,
      team_name: p.team_name,
      name: p.profiles?.name ?? 'Unknown',
    }));
  }

  if (match.sport === 'cricket') {
    const [{ data: mp }, { data: ps }] = await Promise.all([
      supabase
        .from('match_players')
        .select('id, match_id, player_id, team_name, profiles(name)')
        .eq('match_id', id),
      // select * so missing columns (pre-migration 009) don't break the query
      supabase
        .from('player_match_stats')
        .select('*')
        .eq('match_id', id),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    matchPlayers = (mp ?? []).map((p: any) => ({
      id: p.id,
      match_id: p.match_id,
      player_id: p.player_id,
      team_name: p.team_name,
      name: p.profiles?.name ?? 'Unknown',
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    playerStats = Object.fromEntries((ps ?? []).map((s: any) => [
      s.player_id,
      {
        runs_scored:   s.runs_scored,
        wickets_taken: s.wickets_taken,
        catches_taken: s.catches_taken ?? 0,
        balls_faced:   s.balls_faced   ?? 0,
        fours:         s.fours         ?? 0,
        sixes:         s.sixes         ?? 0,
        balls_bowled:  s.balls_bowled  ?? 0,
        runs_conceded: s.runs_conceded ?? 0,
        is_out:        s.is_out ?? false,
        dismissal:     s.dismissal ?? null,
      },
    ]));
  }

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <SportBadge sport={match.sport} />
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
              match.status === 'live' ? 'bg-red-900/50 text-red-400 border-red-800' :
              match.status === 'completed' ? 'bg-gray-800 text-gray-400 border-gray-700' :
              'bg-blue-900/50 text-blue-400 border-blue-800'
            }`}>
              {match.status === 'live' ? '● LIVE' : match.status.toUpperCase()}
            </span>
          </div>
          <h1 className="text-xl font-bold text-white">
            {/^\d+$/.test(match.team_a_name.trim()) ? `Team ${match.team_a_name}` : match.team_a_name}
            {' '}<span className="text-gray-500">vs</span>{' '}
            {/^\d+$/.test(match.team_b_name.trim()) ? `Team ${match.team_b_name}` : match.team_b_name}
          </h1>
          {match.sport === 'cricket' && match.cricket_overs && (
            <p className="text-sm text-gray-500 mt-0.5">{match.cricket_overs} overs</p>
          )}
        </div>
        {canEdit && <MatchControls match={match as Match} />}
      </div>

      {/* Scorer */}
      {match.sport === 'cricket' && (
        <CricketScorer
          match={match as Match}
          scoreA={scoreA}
          scoreB={scoreB}
          canEdit={canEdit}
          matchPlayers={matchPlayers}
          playerStats={playerStats}
        />
      )}
      {match.sport === 'football' && (
        <FootballScorer match={match as Match} scoreA={scoreA} scoreB={scoreB} canEdit={canEdit} />
      )}
      {match.sport === 'badminton' && (
        <BadmintonScorer match={match as Match} scoreA={scoreA} scoreB={scoreB} canEdit={canEdit}
          matchPlayers={matchPlayers} />
      )}

      {/* Winner — use winner_team_name (works for ad-hoc matches too) */}
      {match.status === 'completed' && (match.winner_team_name || match.winner_team_id) && (
        <div className="bg-emerald-900/20 border border-emerald-800 rounded-xl p-4 text-center">
          <p className="text-sm text-emerald-400 font-medium">🏆 Winner</p>
          <p className="text-xl font-bold text-white mt-1">
            {(() => {
              const n = match.winner_team_name
                ?? (match.winner_team_id === match.team_a_id ? match.team_a_name : match.team_b_name);
              return n && /^\d+$/.test(n.trim()) ? `Team ${n}` : n;
            })()}
          </p>
        </div>
      )}
    </div>
  );
}
