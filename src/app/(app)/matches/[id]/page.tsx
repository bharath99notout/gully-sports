import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import dynamic from 'next/dynamic';
import SportBadge from '@/components/SportBadge';
import MatchControls from './MatchControls';
import ShareButton from '@/components/ShareButton';
import MatchConfirmationPanel from './MatchConfirmationPanel';
import { maybeSweepAutoConfirms } from '@/lib/matchConfirmationServer';
import type { ConfirmationState } from '@/lib/matchConfirmation';
import { Match, MatchScore, MatchPlayer, CricketPlayerStat } from '@/types';
import { headers } from 'next/headers';
import type { SportKey } from '@/lib/caliber';
import { buildMatchPlayerImpactRows } from '@/lib/matchImpact';
import MatchPlayerImpactSection from './MatchPlayerImpactSection';
import AdminDeleteMatchButton from './AdminDeleteMatchButton';

// Code-split the per-sport scorers so each match page only ships the JS for
// the sport actually being shown. Loading fallbacks keep the layout stable.
const ScorerSkeleton = () => (
  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 animate-pulse h-64" />
);
const CricketScorer      = dynamic(() => import('./CricketScorer'),      { loading: ScorerSkeleton });
const FootballScorer     = dynamic(() => import('./FootballScorer'),     { loading: ScorerSkeleton });
const BadmintonScorer    = dynamic(() => import('./BadmintonScorer'),    { loading: ScorerSkeleton });
const TableTennisScorer  = dynamic(() => import('./TableTennisScorer'),  { loading: ScorerSkeleton });

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MatchDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  // Promote any matches whose 6h auto-confirm window expired. Cheap (rate-
  // limited + partial index) and runs naturally as users browse.
  await maybeSweepAutoConfirms();

  const { data: match } = await supabase
    .from('matches')
    .select('*, match_scores(*)')
    .eq('id', id)
    .single();

  if (!match) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  const scorerId: string | null = match.scored_by ?? match.created_by ?? null;
  const viewerIsScorer = !!user && user.id === scorerId;
  const confirmationState: ConfirmationState =
    (match.confirmation_state as ConfirmationState | null) ?? 'pending';
  /** Who may change scores: match creator or the designated scorer (often the same). */
  const canEditScores = !!user && (user.id === match.created_by || viewerIsScorer);
  /** Start / end match lifecycle stays with whoever created the fixture. */
  const canControlLifecycle = !!user && user.id === match.created_by;
  /** After a dispute, only the scorer can re-open the scorecard to fix data (DB trigger resets confirmations). */
  const allowDisputeRecheck =
    match.status === 'completed'
    && confirmationState === 'disputed'
    && viewerIsScorer;

  // Fetch confirmations, scorer, roster, all stat rows, admin flag — one roundtrip batch.
  const [{ data: confRows }, { data: scorerRow }, { data: mp }, { data: allPms }, { data: adminProfile }] = await Promise.all([
    supabase
      .from('match_confirmations')
      .select('player_id, status, disputed_reason')
      .eq('match_id', id),
    scorerId
      ? supabase.from('profiles').select('name').eq('id', scorerId).single()
      : Promise.resolve({ data: null }),
    supabase
      .from('match_players')
      .select('id, match_id, player_id, team_name, profiles(name)')
      .eq('match_id', id),
    supabase
      .from('player_match_stats')
      .select('*, profiles(id, name)')
      .eq('match_id', id),
    user
      ? supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
  ]);
  const confByPlayer = new Map(
    (confRows ?? []).map(c => [c.player_id, c]),
  );

  // Explicit boolean — only true when column exists and is true (never show delete UI otherwise).
  const viewerIsAdmin =
    !!user
    && adminProfile != null
    && (adminProfile as { is_admin?: boolean | null }).is_admin === true;

  const canEditScoresForUi = canEditScores || viewerIsAdmin;
  const adminOverrideCompleted = viewerIsAdmin && match.status === 'completed';

  const scores: MatchScore[] = match.match_scores ?? [];
  const scoreA = scores.find((s: MatchScore) => s.team_name === match.team_a_name) ?? null;
  const scoreB = scores.find((s: MatchScore) => s.team_name === match.team_b_name) ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchPlayers: MatchPlayer[] = (mp ?? []).map((p: any) => ({
    id: p.id,
    match_id: p.match_id,
    player_id: p.player_id,
    team_name: p.team_name,
    name: p.profiles?.name ?? 'Unknown',
  }));

  let playerStats: Record<string, CricketPlayerStat> = {};
  if (match.sport === 'cricket') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    playerStats = Object.fromEntries((allPms ?? []).map((s: any) => [
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

  const impactRows = match.status !== 'upcoming'
    ? buildMatchPlayerImpactRows(
        match.sport as SportKey,
        {
          winner_team_name: match.winner_team_name,
          winner_team_id: match.winner_team_id,
          team_a_id: match.team_a_id,
          team_b_id: match.team_b_id,
          team_a_name: match.team_a_name,
          team_b_name: match.team_b_name,
          status: match.status,
        },
        matchPlayers,
        allPms ?? [],
        scoreA,
        scoreB,
      )
    : [];

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
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <MatchShareTrigger match={match as Match} scoreA={scoreA} scoreB={scoreB} />
          {canControlLifecycle && <MatchControls match={match as Match} />}
        </div>
      </div>

      {/* Admin-only delete — only after the match has ended (not LIVE / upcoming). */}
      {viewerIsAdmin && match.status === 'completed' && (
        <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 px-3 py-2.5 flex flex-col gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-400">Admin tools</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Edit scores in the scorecard below, or permanently delete the match (all scores, stats, and confirmations — CASCADE).
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <a
              href="#match-scorecard"
              className="inline-flex items-center justify-center rounded-xl text-sm px-3 py-2 font-semibold bg-emerald-950/50 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900/40 transition-colors"
            >
              Edit scores
            </a>
            <AdminDeleteMatchButton matchId={match.id} />
          </div>
        </div>
      )}

      {/* Trust / confirmation panel — only shows for non-confirmed matches */}
      {match.status === 'completed' && (
        <MatchConfirmationPanel
          matchId={match.id}
          matchState={confirmationState}
          autoConfirmAt={match.auto_confirm_at ?? null}
          scoredById={scorerId}
          scorerName={(scorerRow as { name: string } | null)?.name ?? null}
          currentUserId={user?.id ?? null}
          viewerIsScorer={viewerIsScorer}
          participants={matchPlayers.map(p => {
            const conf = confByPlayer.get(p.player_id);
            return {
              player_id: p.player_id,
              name: p.name,
              team_name: p.team_name,
              status: (conf?.status ?? 'pending') as 'pending' | 'confirmed' | 'disputed',
              disputed_reason: conf?.disputed_reason ?? null,
            };
          })}
        />
      )}

      {/* Scorer — anchor for admin &quot;Edit scores&quot; */}
      <div id="match-scorecard" className="flex flex-col gap-6 scroll-mt-24">
        {match.sport === 'cricket' && (
          <CricketScorer
            match={match as Match}
            scoreA={scoreA}
            scoreB={scoreB}
            canEdit={canEditScoresForUi}
            allowDisputeRecheck={allowDisputeRecheck}
            adminOverrideCompleted={adminOverrideCompleted}
            matchPlayers={matchPlayers}
            playerStats={playerStats}
          />
        )}
        {match.sport === 'football' && (
          <FootballScorer
            match={match as Match}
            scoreA={scoreA}
            scoreB={scoreB}
            canEdit={canEditScoresForUi}
            allowDisputeRecheck={allowDisputeRecheck}
            adminOverrideCompleted={adminOverrideCompleted}
          />
        )}
        {match.sport === 'badminton' && (
          <BadmintonScorer
            match={match as Match}
            scoreA={scoreA}
            scoreB={scoreB}
            canEdit={canEditScoresForUi}
            allowDisputeRecheck={allowDisputeRecheck}
            adminOverrideCompleted={adminOverrideCompleted}
            matchPlayers={matchPlayers}
          />
        )}
        {match.sport === 'table_tennis' && (
          <TableTennisScorer
            match={match as Match}
            scoreA={scoreA}
            scoreB={scoreB}
            canEdit={canEditScoresForUi}
            allowDisputeRecheck={allowDisputeRecheck}
            adminOverrideCompleted={adminOverrideCompleted}
            matchPlayers={matchPlayers}
          />
        )}
      </div>

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

      <MatchPlayerImpactSection rows={impactRows} />
    </div>
  );
}

// ── Share trigger: builds absolute URL + summary text ──────────────────────────

async function MatchShareTrigger({ match, scoreA, scoreB }: {
  match: Match;
  scoreA: MatchScore | null;
  scoreB: MatchScore | null;
}) {
  const hdrs = await headers();
  const host = hdrs.get('host') ?? '';
  const proto = hdrs.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const url = `${proto}://${host}/matches/${match.id}`;

  const teamA = /^\d+$/.test(match.team_a_name.trim()) ? `Team ${match.team_a_name}` : match.team_a_name;
  const teamB = /^\d+$/.test(match.team_b_name.trim()) ? `Team ${match.team_b_name}` : match.team_b_name;
  const sportEmoji = match.sport === 'cricket' ? '🏏' : match.sport === 'football' ? '⚽' : '🏸';

  let scoreLine = '';
  if (match.sport === 'cricket') {
    scoreLine = `${teamA} ${scoreA?.runs ?? 0}/${scoreA?.wickets ?? 0} · ${teamB} ${scoreB?.runs ?? 0}/${scoreB?.wickets ?? 0}`;
  } else if (match.sport === 'football') {
    scoreLine = `${teamA} ${scoreA?.goals ?? 0} - ${scoreB?.goals ?? 0} ${teamB}`;
  } else {
    const a = (scoreA?.sets ?? []).join('·') || '–';
    const b = (scoreB?.sets ?? []).join('·') || '–';
    scoreLine = `${teamA} [${a}] vs ${teamB} [${b}]`;
  }

  const winner = match.winner_team_name
    ?? (match.winner_team_id === match.team_a_id ? match.team_a_name : match.team_b_name);
  const winnerLine = match.status === 'completed' && winner
    ? `🏆 ${/^\d+$/.test(winner.trim()) ? `Team ${winner}` : winner} won`
    : match.status === 'live' ? '🔴 LIVE' : '';

  const text = [`${sportEmoji} ${teamA} vs ${teamB}`, scoreLine, winnerLine].filter(Boolean).join('\n');

  return <ShareButton text={text} url={url} title="GullySports Match" variant="icon" />;
}
