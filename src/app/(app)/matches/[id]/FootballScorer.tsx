'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { offlineMutate } from '@/lib/offline/mutate';
import { reloadMatchClean } from '@/lib/matchNav';
import Card from '@/components/ui/Card';
import { Loader2, Minus, Plus, X, Trophy, Flag } from 'lucide-react';
import type { Match, MatchScore, MatchPlayer } from '@/types';
import PlayerSearchAndAdd, { type PlayerAddResult } from '@/components/PlayerSearchAndAdd';
import { emitMatchScoreUpdate } from '@/lib/matchLiveBus';

interface FootballPlayerStat {
  goals_scored: number;
}

interface Props {
  match: Match;
  scoreA: MatchScore | null;
  scoreB: MatchScore | null;
  canEdit: boolean;
  allowDisputeRecheck?: boolean;
  adminOverrideCompleted?: boolean;
  matchPlayers: MatchPlayer[];
  playerStats: Record<string, FootballPlayerStat>;
}

function teamLabel(name: string) {
  return /^\d+$/.test(name.trim()) ? `Team ${name.trim()}` : name;
}

/**
 * Football scorer — Phase 1 + 2 (May 2026).
 *
 * Mirrors the cricket/foosball shape so users get the same end-to-end flow
 * across sports: match roster ▸ score with player attribution ▸ end-match
 * inside the scorer ▸ post-match summary with MVP + top scorer per team.
 *
 * Scoring path:
 *   "+ Goal" on a team → modal "Who scored?" lists that team's roster + "Skip".
 *   Picking a scorer:
 *     - Increments `match_scores.goals` for the team
 *     - Increments `player_match_stats.goals_scored` for the picked player
 *   "Skip":
 *     - Bumps the team total, no per-player credit
 *
 *   "− Undo" on a team:
 *     - Decrements the team total only. We don't try to figure out which
 *       individual to debit (last scorer might be wrong, undo by accident).
 *       Use the host-edit flow on a completed match if you need to fix
 *       per-player goals later.
 */
export default function FootballScorer({
  match, scoreA, scoreB, canEdit,
  allowDisputeRecheck = false, adminOverrideCompleted = false,
  matchPlayers: initPlayers, playerStats: initStats,
}: Props) {
  const isCompleted = match.status === 'completed';
  const scoringActive =
    match.status === 'live'
    || (isCompleted && (allowDisputeRecheck || adminOverrideCompleted));

  const [players, setPlayers] = useState<MatchPlayer[]>(initPlayers);
  const [stats, setStats] = useState<Record<string, FootballPlayerStat>>(initStats);
  const [gA, setGA] = useState(scoreA?.goals ?? 0);
  const [gB, setGB] = useState(scoreB?.goals ?? 0);
  const [busy, setBusy] = useState<string | null>(null);

  // Keep MatchHero in sync with optimistic goal counts.
  useEffect(() => {
    emitMatchScoreUpdate(
      match.id,
      { ...(scoreA ?? {}), goals: gA, runs: 0, wickets: 0, overs_faced: 0, sets: scoreA?.sets },
      { ...(scoreB ?? {}), goals: gB, runs: 0, wickets: 0, overs_faced: 0, sets: scoreB?.sets },
    );
  }, [match.id, gA, gB, scoreA, scoreB]);

  // Goal-attribution modal state
  const [scorerPickFor, setScorerPickFor] = useState<'a' | 'b' | null>(null);
  // Add-player flow (per team)
  const [addTeam, setAddTeam] = useState<string | null>(null);
  // Declare-winner modal
  const [declareOpen, setDeclareOpen] = useState(false);
  const [winnerSide, setWinnerSide] = useState<'a' | 'b' | null>(null);

  const teamA = scoreA?.team_name ?? match.team_a_name;
  const teamB = scoreB?.team_name ?? match.team_b_name;

  const playersA = useMemo(() => players.filter(p => p.team_name === teamA), [players, teamA]);
  const playersB = useMemo(() => players.filter(p => p.team_name === teamB), [players, teamB]);

  const supabase = createClient();

  function getStats(pid: string): FootballPlayerStat {
    return stats[pid] ?? { goals_scored: 0 };
  }

  async function bumpTeamGoals(side: 'a' | 'b', delta: 1 | -1, score: MatchScore | null) {
    if (!score) return;
    const current = side === 'a' ? gA : gB;
    const next = Math.max(0, current + delta);
    if (next === current) return;
    if (side === 'a') setGA(next); else setGB(next);
    await offlineMutate(supabase, {
      kind: 'update', table: 'match_scores', values: { goals: next }, where: { id: score.id },
    }, match.id);
  }

  async function upsertGoalForPlayer(pid: string) {
    const cur = getStats(pid);
    const next = { goals_scored: (cur.goals_scored ?? 0) + 1 };
    setStats(p => ({ ...p, [pid]: next }));
    await offlineMutate(supabase, {
      kind: 'upsert',
      table: 'player_match_stats',
      values: {
        match_id: match.id,
        player_id: pid,
        sport: match.sport,
        runs_scored: 0,
        wickets_taken: 0,
        catches_taken: 0,
        goals_scored: next.goals_scored,
      },
      onConflict: 'match_id,player_id',
    }, match.id);
  }

  async function handleGoal(side: 'a' | 'b', scorerId: string | null) {
    if (!canEdit || !scoringActive || busy) return;
    setBusy(`add-${side}`);
    await bumpTeamGoals(side, 1, side === 'a' ? scoreA : scoreB);
    if (scorerId) await upsertGoalForPlayer(scorerId);
    setBusy(null);
    setScorerPickFor(null);
  }

  async function undoGoal(side: 'a' | 'b') {
    if (!canEdit || !scoringActive || busy) return;
    setBusy(`undo-${side}`);
    await bumpTeamGoals(side, -1, side === 'a' ? scoreA : scoreB);
    setBusy(null);
  }

  async function addPlayerToTeam(playerId: string, displayName: string): Promise<PlayerAddResult> {
    const team = addTeam;
    if (!team) return { ok: false, error: 'No team selected' };
    if (players.some(p => p.player_id === playerId && p.team_name === team)) {
      return { ok: false, error: `${displayName} is already on ${team}.` };
    }
    const { error } = await offlineMutate(supabase, {
      kind: 'insert',
      table: 'match_players',
      values: { match_id: match.id, player_id: playerId, team_name: team },
    }, match.id);
    if (error) return { ok: false, error: error.message };
    setPlayers(p => [...p, {
      id: crypto.randomUUID(), match_id: match.id, player_id: playerId, team_name: team, name: displayName,
    }]);
    return { ok: true };
  }

  async function removePlayer(mp: MatchPlayer) {
    if (!canEdit) return;
    await offlineMutate(supabase, {
      kind: 'delete',
      table: 'match_players',
      where: { match_id: match.id, player_id: mp.player_id },
    }, match.id);
    setPlayers(p => p.filter(x => x.player_id !== mp.player_id));
  }

  async function confirmDeclare() {
    setBusy('declare');
    const winnerName =
      winnerSide === 'a' ? teamA
      : winnerSide === 'b' ? teamB
      : null;
    const winnerId =
      winnerSide === 'a' ? (match.team_a_id ?? null)
      : winnerSide === 'b' ? (match.team_b_id ?? null)
      : null;

    await offlineMutate(supabase, {
      kind: 'update',
      table: 'matches',
      values: {
        status: 'completed',
        winner_team_id: winnerId,
        winner_team_name: winnerName,
      },
      where: { id: match.id },
    }, match.id);

    // Seed `player_match_stats` for every roster player who doesn't have a
    // row yet — so caliber/leaderboard counts them as having played even
    // if they didn't score. Goal scorers already have rows from upserts.
    const missingPlayers = players.filter(p => !stats[p.player_id]);
    if (missingPlayers.length > 0) {
      await offlineMutate(supabase, {
        kind: 'upsert',
        table: 'player_match_stats',
        values: missingPlayers.map(p => ({
          match_id: match.id,
          player_id: p.player_id,
          sport: match.sport,
          runs_scored: 0,
          wickets_taken: 0,
          catches_taken: 0,
          goals_scored: 0,
        })),
        onConflict: 'match_id,player_id',
      }, match.id);
    }

    setBusy(null);
    reloadMatchClean();
  }

  function openDeclareModal() {
    // Pre-select the leading team — score-based default.
    setWinnerSide(gA > gB ? 'a' : gB > gA ? 'b' : null);
    setDeclareOpen(true);
  }

  // ── Computed: top scorers per team (used live + in summary) ────────────────
  const topScorerA = useMemo(() => topScorer(playersA, stats), [playersA, stats]);
  const topScorerB = useMemo(() => topScorer(playersB, stats), [playersB, stats]);

  // MVP for the live preview banner — top goal scorer, prefer winning side.
  const leadingSide: 'a' | 'b' | null = gA > gB ? 'a' : gB > gA ? 'b' : null;
  const livePreviewMvp = useMemo(() => {
    const all = [...playersA, ...playersB];
    let best: { name: string; goals: number; team: string } | null = null;
    for (const p of all) {
      const g = getStats(p.player_id).goals_scored;
      if (g === 0) continue;
      const winning = (p.team_name === teamA && leadingSide === 'a')
                   || (p.team_name === teamB && leadingSide === 'b');
      if (!best
          || g > best.goals
          || (g === best.goals && winning && best.team !== (leadingSide === 'a' ? teamA : teamB))) {
        best = { name: p.name, goals: g, team: p.team_name };
      }
    }
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playersA, playersB, stats, leadingSide]);

  return (
    <div className="flex flex-col gap-4">
      {allowDisputeRecheck && (
        <p className="text-sm text-amber-200 bg-amber-950/35 border border-amber-800/50 rounded-xl px-3 py-2">
          <span className="font-semibold text-amber-300">Disputed — scorer recheck.</span>{' '}
          Adjust goals below; saving clears disputes and re-opens confirmations.
        </p>
      )}

      {/* Score cards */}
      <div className="grid grid-cols-2 gap-3">
        <TeamScoreCard
          team={teamA} score={gA}
          isLeader={gA > gB && (gA + gB > 0)}
          canEdit={canEdit && scoringActive}
          topScorer={topScorerA}
          onAdd={() => setScorerPickFor('a')}
          onUndo={() => undoGoal('a')}
          busy={busy}
        />
        <TeamScoreCard
          team={teamB} score={gB}
          isLeader={gB > gA && (gA + gB > 0)}
          canEdit={canEdit && scoringActive}
          topScorer={topScorerB}
          onAdd={() => setScorerPickFor('b')}
          onUndo={() => undoGoal('b')}
          busy={busy}
        />
      </div>

      {/* End match button + live MVP preview */}
      {canEdit && scoringActive && (
        <Card padding="md" className="flex flex-col gap-3">
          {livePreviewMvp && (
            <div className="text-xs text-emerald-300 inline-flex items-center gap-1.5">
              <Trophy size={12} />
              MVP so far: <span className="font-bold text-white">{livePreviewMvp.name}</span>
              <span className="text-gray-400">({livePreviewMvp.goals} goals)</span>
            </div>
          )}
          <button
            type="button"
            onClick={openDeclareModal}
            disabled={!!busy}
            className="w-full inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold px-3 py-2.5 rounded-xl"
          >
            <Trophy size={14} />
            End Match &amp; Declare Winner
          </button>
        </Card>
      )}

      {/* Post-match summary */}
      {isCompleted && !scoringActive && (
        <FootballPostMatchSummary
          match={match}
          teamA={teamA} teamB={teamB}
          gA={gA} gB={gB}
          playersA={playersA} playersB={playersB}
          stats={stats}
        />
      )}

      {/* Match player roster */}
      {canEdit && scoringActive && (
        <Card padding="md">
          <h3 className="text-sm font-semibold text-white mb-3">Match Players</h3>
          <div className="grid grid-cols-2 gap-4">
            {[teamA, teamB].map(team => (
              <div key={team}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-400 truncate">{teamLabel(team)}</p>
                  <button onClick={() => setAddTeam(team)}
                    className="flex items-center gap-0.5 text-xs text-emerald-400 hover:underline">
                    <Plus size={11} /> Add
                  </button>
                </div>
                {players.filter(p => p.team_name === team).map(p => {
                  const s = getStats(p.player_id);
                  return (
                    <div key={p.player_id} className="flex items-center justify-between py-1 border-b border-gray-800/50 last:border-0">
                      <span className="text-xs text-white truncate">{p.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {s.goals_scored > 0 && (
                          <span className="text-xs text-emerald-400 font-semibold">⚽ {s.goals_scored}</span>
                        )}
                        <button onClick={() => removePlayer(p)}
                          className="text-gray-700 hover:text-red-400 transition-colors">
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {players.filter(p => p.team_name === team).length === 0 && (
                  <p className="text-xs text-gray-600 italic">No players yet</p>
                )}
              </div>
            ))}
          </div>

          {addTeam && (
            <div className="mt-4 pt-3 border-t border-gray-800">
              <p className="text-xs text-gray-400 mb-2">
                Add to <span className="text-white">{addTeam}</span>
              </p>
              <PlayerSearchAndAdd
                onAdd={addPlayerToTeam}
                excludePlayerIds={players.filter(p => p.team_name === addTeam).map(p => p.player_id)}
                sameSidePlayerIds={players.filter(p => p.team_name === addTeam).map(p => p.player_id)}
                placeholder="Search by name or 10-digit mobile…"
                onSuccess={() => setAddTeam(null)}
              />
              <button type="button" onClick={() => setAddTeam(null)}
                className="mt-2 text-xs text-gray-600 hover:text-gray-400">
                Cancel
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Who scored modal */}
      {scorerPickFor && (
        <ScorerPickModal
          team={scorerPickFor === 'a' ? teamA : teamB}
          options={scorerPickFor === 'a' ? playersA : playersB}
          onPick={pid => handleGoal(scorerPickFor, pid)}
          onSkip={() => handleGoal(scorerPickFor, null)}
          onCancel={() => setScorerPickFor(null)}
          busy={!!busy}
        />
      )}

      {/* Declare winner modal */}
      {declareOpen && (
        <DeclareWinnerModal
          teamA={teamA} teamB={teamB}
          gA={gA} gB={gB}
          winnerSide={winnerSide}
          onPick={setWinnerSide}
          onConfirm={confirmDeclare}
          onCancel={() => setDeclareOpen(false)}
          busy={busy === 'declare'}
        />
      )}
    </div>
  );
}

function topScorer(
  players: MatchPlayer[],
  stats: Record<string, FootballPlayerStat>,
): { name: string; goals: number } | null {
  let best: { name: string; goals: number } | null = null;
  for (const p of players) {
    const g = stats[p.player_id]?.goals_scored ?? 0;
    if (g === 0) continue;
    if (!best || g > best.goals) best = { name: p.name, goals: g };
  }
  return best;
}

// ── Components ──────────────────────────────────────────────────────────────

function TeamScoreCard({
  team, score, isLeader, canEdit, topScorer, onAdd, onUndo, busy,
}: {
  team: string;
  score: number;
  isLeader: boolean;
  canEdit: boolean;
  topScorer: { name: string; goals: number } | null;
  onAdd: () => void;
  onUndo: () => void;
  busy: string | null;
}) {
  return (
    <Card padding="md" className={isLeader ? 'border-emerald-700 bg-emerald-950/15' : ''}>
      <p className="text-xs text-gray-400 truncate mb-1">{teamLabel(team)}</p>
      <p className={`text-5xl font-black tabular-nums ${isLeader ? 'text-emerald-300' : 'text-white'}`}>
        {score}
      </p>
      {topScorer && (
        <p className="text-[11px] text-gray-500 mt-1 truncate">
          Top: <span className="text-emerald-300">{topScorer.name}</span> ({topScorer.goals})
        </p>
      )}
      {canEdit && (
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={onUndo}
            disabled={!!busy || score === 0}
            aria-label="Undo goal"
            className="w-9 h-9 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-300 flex items-center justify-center"
          >
            {busy?.endsWith('-a') || busy?.endsWith('-b') ? <Loader2 size={14} className="animate-spin" /> : <Minus size={14} />}
          </button>
          <button
            type="button"
            onClick={onAdd}
            disabled={!!busy}
            className="flex-1 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-1.5"
          >
            <Plus size={14} /> Goal
          </button>
        </div>
      )}
    </Card>
  );
}

function ScorerPickModal({ team, options, onPick, onSkip, onCancel, busy }: {
  team: string;
  options: MatchPlayer[];
  onPick: (pid: string) => void;
  onSkip: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 w-full max-w-sm">
        <h3 className="text-lg font-bold text-white mb-1">⚽ Who scored?</h3>
        <p className="text-xs text-gray-500 mb-4 truncate">For {teamLabel(team)}</p>

        {options.length === 0 ? (
          <p className="text-sm text-amber-400 mb-3">
            No players on this team yet. Add them below or skip attribution.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto mb-4">
            {options.map(p => (
              <button
                key={p.player_id}
                type="button"
                onClick={() => onPick(p.player_id)}
                disabled={busy}
                className="w-full text-left px-3 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-white disabled:opacity-50"
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onCancel} disabled={busy}
            className="flex-1 py-2 rounded-xl bg-gray-800 text-gray-300 text-sm disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onSkip} disabled={busy}
            className="flex-1 py-2 rounded-xl border border-gray-700 hover:bg-gray-800 text-sm text-gray-300 disabled:opacity-50">
            Skip — no scorer
          </button>
        </div>
      </div>
    </div>
  );
}

function DeclareWinnerModal({ teamA, teamB, gA, gB, winnerSide, onPick, onConfirm, onCancel, busy }: {
  teamA: string; teamB: string;
  gA: number; gB: number;
  winnerSide: 'a' | 'b' | null;
  onPick: (side: 'a' | 'b' | null) => void;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 w-full max-w-sm">
        <h3 className="text-lg font-bold text-white mb-1">🏆 Declare winner</h3>
        <p className="text-xs text-gray-500 mb-4">
          Final score · <span className="text-white">{gA}</span> – <span className="text-white">{gB}</span>
        </p>

        <div className="flex flex-col gap-2 mb-4">
          {([
            { side: 'a' as const, name: teamA, score: gA },
            { side: 'b' as const, name: teamB, score: gB },
          ]).map(t => (
            <button
              key={t.side}
              type="button"
              onClick={() => onPick(winnerSide === t.side ? null : t.side)}
              disabled={busy}
              className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors disabled:opacity-50 ${
                winnerSide === t.side
                  ? 'border-emerald-600 bg-emerald-950/50 text-emerald-200'
                  : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
              }`}>
              <span className="flex items-center justify-between">
                <span>{teamLabel(t.name)}</span>
                <span className="text-xs">{t.score} goals</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => onPick(null)}
            disabled={busy}
            className={`w-full text-left px-3 py-2 rounded-xl border text-xs transition-colors disabled:opacity-50 ${
              winnerSide === null
                ? 'border-gray-600 bg-gray-800 text-white'
                : 'border-gray-800 bg-gray-900 text-gray-500 hover:text-gray-300'
            }`}>
            <Flag size={11} className="inline-block mr-1.5" />
            End with no result
          </button>
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel} disabled={busy}
            className="flex-1 py-2 rounded-xl bg-gray-800 text-gray-300 text-sm disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={busy}
            className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trophy size={13} />}
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Post-match summary ──────────────────────────────────────────────────────

function FootballPostMatchSummary({
  match, teamA, teamB, gA, gB, playersA, playersB, stats,
}: {
  match: Match;
  teamA: string; teamB: string;
  gA: number; gB: number;
  playersA: MatchPlayer[];
  playersB: MatchPlayer[];
  stats: Record<string, FootballPlayerStat>;
}) {
  const winner = match.winner_team_name ?? null;
  const winnerSide = winner === teamA ? 'a' : winner === teamB ? 'b' : null;

  // MVP across both teams: top scorer; tie → on winning team
  const all = [...playersA, ...playersB];
  let mvp: { name: string; team: string; goals: number } | null = null;
  for (const p of all) {
    const g = stats[p.player_id]?.goals_scored ?? 0;
    if (g === 0) continue;
    if (!mvp
        || g > mvp.goals
        || (g === mvp.goals && p.team_name === winner && mvp.team !== winner)) {
      mvp = { name: p.name, team: p.team_name, goals: g };
    }
  }

  const topA = topScorer(playersA, stats);
  const topB = topScorer(playersB, stats);

  return (
    <Card padding="md" className="flex flex-col gap-4">
      <div className={`rounded-2xl border p-4 flex flex-col items-center gap-1.5 ${
        winner ? 'bg-emerald-900/30 border-emerald-800/60' : 'bg-gray-900 border-gray-800'
      }`}>
        {winner ? (
          <>
            <Trophy size={28} className="text-emerald-300" />
            <p className="text-base font-bold text-white">{teamLabel(winner)} won</p>
            <p className="text-[11px] text-gray-400">
              Final · <strong className="text-white">{teamLabel(teamA)} {gA}</strong> — <strong className="text-white">{gB} {teamLabel(teamB)}</strong>
            </p>
          </>
        ) : (
          <>
            <Flag size={20} className="text-gray-500" />
            <p className="text-sm text-gray-300">Match ended without a result</p>
            <p className="text-[11px] text-gray-500">{teamLabel(teamA)} {gA} — {gB} {teamLabel(teamB)}</p>
          </>
        )}
      </div>

      {mvp && (
        <div className="rounded-xl border border-yellow-700/50 bg-yellow-950/30 px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-yellow-500 to-amber-700 flex items-center justify-center text-base font-black text-black shrink-0">
            🏆
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-yellow-400 font-bold">Player of the Match</p>
            <p className="text-sm text-white font-bold truncate">{mvp.name}</p>
            <p className="text-[11px] text-gray-400 truncate">
              {teamLabel(mvp.team)} · {mvp.goals} goal{mvp.goals === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <TeamSummary
          team={teamA} goals={gA}
          isWinner={winnerSide === 'a'}
          top={topA}
        />
        <TeamSummary
          team={teamB} goals={gB}
          isWinner={winnerSide === 'b'}
          top={topB}
        />
      </div>

      {/* Per-player goals breakdown */}
      {(playersA.length + playersB.length > 0) && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Goal scorers</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { players: playersA, name: teamA },
              { players: playersB, name: teamB },
            ].map(side => {
              const scorers = side.players
                .map(p => ({ p, g: stats[p.player_id]?.goals_scored ?? 0 }))
                .filter(x => x.g > 0)
                .sort((a, b) => b.g - a.g);
              return (
                <div key={side.name}>
                  <p className="text-[10px] text-gray-500 truncate mb-1">{teamLabel(side.name)}</p>
                  {scorers.length === 0 ? (
                    <p className="text-[11px] text-gray-600 italic">No goals scored</p>
                  ) : (
                    scorers.map(s => (
                      <p key={s.p.player_id} className="text-xs text-gray-200 truncate">
                        ⚽ {s.p.name} <span className="text-gray-500">× {s.g}</span>
                      </p>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

function TeamSummary({ team, goals, isWinner, top }: {
  team: string;
  goals: number;
  isWinner: boolean;
  top: { name: string; goals: number } | null;
}) {
  return (
    <div className={`rounded-xl border p-3 ${
      isWinner ? 'border-emerald-700 bg-emerald-950/20' : 'border-gray-800 bg-gray-900/40'
    }`}>
      <p className="text-[11px] uppercase tracking-wider text-gray-500 truncate">{teamLabel(team)}</p>
      <p className={`text-3xl font-bold tabular-nums ${isWinner ? 'text-emerald-300' : 'text-white'}`}>
        {goals}
      </p>
      <p className="text-[11px] text-gray-500 mt-1 truncate">
        {top ? <>Top: <span className="text-emerald-300">{top.name}</span> ({top.goals})</> : 'No scorer recorded'}
      </p>
    </div>
  );
}
