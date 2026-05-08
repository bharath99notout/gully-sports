'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { offlineMutate } from '@/lib/offline/mutate';
import { reloadMatchClean } from '@/lib/matchNav';
import Card from '@/components/ui/Card';
import { Loader2, Minus, Plus, Trophy, RotateCcw, Flag } from 'lucide-react';
import type { Match, MatchScore, MatchPlayer } from '@/types';

interface Props {
  match: Match;
  scoreA: MatchScore | null;
  scoreB: MatchScore | null;
  canEdit: boolean;
  /** When set, completed + disputed matches still show full scoring UI for the scorer. */
  allowDisputeRecheck?: boolean;
  /** Admin: allow editing scores on completed matches (not only dispute recheck). */
  adminOverrideCompleted?: boolean;
  matchPlayers: MatchPlayer[];
}

/**
 * Foosball scorer — designed for the way casual foosball actually plays out:
 * a "match" is a sequence of games at the table, each game ends with one
 * side scoring however many goals the players agreed on (5, 7, whatever).
 * Inside a game, nobody tracks the per-goal score — at the end the host
 * just bumps the winner's tally by 1 and they go again.
 *
 * UX:
 *   • Big "games won" tally per side ("3 - 1"), updated live.
 *   • Each side has +1 (game won) and -1 (undo) buttons.
 *   • "End match" declares the winner from the current tally (with a tie
 *     fallback to "End — no result").
 *   • "Reopen" reverts a finished match back to live.
 *
 * Schema reuse: stores per-game-wins in `match_scores.goals` (the same
 * column football uses for actual goals — semantically "score" in both
 * cases). No new migration needed.
 */
export default function FoosballScorer({
  match, scoreA, scoreB, canEdit,
  allowDisputeRecheck = false,
  adminOverrideCompleted = false,
  matchPlayers,
}: Props) {
  const [gA, setGA] = useState<number>(scoreA?.goals ?? 0);
  const [gB, setGB] = useState<number>(scoreB?.goals ?? 0);
  const [busy, setBusy] = useState<string | null>(null);

  const teamA = scoreA?.team_name ?? match.team_a_name;
  const teamB = scoreB?.team_name ?? match.team_b_name;
  const winnerName = match.winner_team_name ?? null;
  const isCompleted = match.status === 'completed';
  // Mirrors the other scorers — scoring is active when the match is live
  // OR when an admin / scorer has explicitly opened it (admin "Edit
  // scores" or scorer's dispute-recheck flow). Without this, completed
  // foosball matches were read-only even in admin edit mode.
  const scoringActive =
    match.status === 'live'
    || (isCompleted && (allowDisputeRecheck || adminOverrideCompleted));

  const playersA = matchPlayers.filter(p => p.team_name === teamA);
  const playersB = matchPlayers.filter(p => p.team_name === teamB);
  const format: 'singles' | 'doubles' = (playersA.length >= 2 || playersB.length >= 2) ? 'doubles' : 'singles';

  // Predicted winner from the current tally — surfaced on the End-match
  // button so the host knows what they're confirming.
  const leaderName =
    gA > gB ? teamA :
    gB > gA ? teamB :
    null;

  async function bump(side: 'a' | 'b', delta: 1 | -1) {
    if (!canEdit || !scoringActive || busy) return;
    const score = side === 'a' ? scoreA : scoreB;
    if (!score) return;
    const current = side === 'a' ? gA : gB;
    const next = Math.max(0, current + delta);
    if (next === current) return; // already at 0, nothing to undo
    if (side === 'a') setGA(next); else setGB(next);
    const action = `${side}${delta > 0 ? '+' : '-'}`;
    setBusy(action);
    const supabase = createClient();
    await offlineMutate(supabase, {
      kind: 'update', table: 'match_scores', values: { goals: next }, where: { id: score.id },
    }, match.id);
    setBusy(null);
  }

  async function endMatch(declareNoResult = false) {
    if (!canEdit || !scoringActive || busy) return;
    if (!declareNoResult && gA === 0 && gB === 0) {
      alert('Add at least one game won before declaring a winner, or use "End — no result".');
      return;
    }
    if (!declareNoResult && !leaderName) {
      // Tied — bounce them to the no-result path.
      if (!confirm(`Tied at ${gA} - ${gB}. End with no result?`)) return;
      declareNoResult = true;
    }
    setBusy(declareNoResult ? 'end-noresult' : 'end');
    const supabase = createClient();

    const winnerName = declareNoResult ? null : leaderName;
    const winnerId =
      !declareNoResult && winnerName === teamA ? (match.team_a_id ?? null)
      : !declareNoResult && winnerName === teamB ? (match.team_b_id ?? null)
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

    // Stamp player_match_stats so caliber + leaderboards pick up the
    // match. Foosball stats are otherwise zero — these rows are just
    // "they played here".
    const statRows = matchPlayers.map(p => ({
      match_id: match.id,
      player_id: p.player_id,
      sport: match.sport,
      runs_scored: 0,
      wickets_taken: 0,
      catches_taken: 0,
      goals_scored: 0,
    }));
    if (statRows.length > 0) {
      await offlineMutate(supabase, {
        kind: 'upsert',
        table: 'player_match_stats',
        values: statRows,
        onConflict: 'match_id,player_id',
      }, match.id);
    }

    setBusy(null);
    reloadMatchClean();
  }

  async function reopen() {
    if (!isCompleted || busy) return;
    if (!confirm('Reopen this match? The winner will be cleared but the games-won tally stays.')) return;
    setBusy('reopen');
    const supabase = createClient();
    await offlineMutate(supabase, {
      kind: 'update',
      table: 'matches',
      values: { status: 'live', winner_team_id: null, winner_team_name: null },
      where: { id: match.id },
    }, match.id);
    setBusy(null);
    reloadMatchClean();
  }

  return (
    <Card padding="md" className="flex flex-col gap-4">
      <div className="text-center">
        <p className="text-[11px] uppercase tracking-wider text-gray-500">
          {format === 'singles' ? '🧍 Singles' : '👥 Doubles'} · Foosball
        </p>
        {isCompleted && !scoringActive ? (
          <p className="text-sm text-gray-400 mt-1">
            {winnerName ? `${winnerName} won` : 'Match ended without a result'}
          </p>
        ) : isCompleted && scoringActive ? (
          <p className="text-sm text-amber-300 mt-1">
            Editing a completed match — your changes overwrite the recorded result.
          </p>
        ) : (
          <p className="text-sm text-gray-400 mt-1">
            Tap <strong className="text-emerald-400">+1</strong> for the side that won the latest game. End the match when you&apos;re done.
          </p>
        )}
      </div>

      {/* Big tally — A score · vs · B score */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 bg-gray-950/60 border border-gray-800 rounded-2xl px-4 py-4">
        <div className="text-center min-w-0">
          <p className="text-xs text-gray-400 truncate">{teamA}</p>
          <p className={`text-4xl font-black tabular-nums ${gA > gB ? 'text-emerald-300' : 'text-white'}`}>{gA}</p>
        </div>
        <span className="text-xs text-gray-600 font-bold">vs</span>
        <div className="text-center min-w-0">
          <p className="text-xs text-gray-400 truncate">{teamB}</p>
          <p className={`text-4xl font-black tabular-nums ${gB > gA ? 'text-emerald-300' : 'text-white'}`}>{gB}</p>
        </div>
      </div>

      {/* Per-side game-won controls */}
      {scoringActive && canEdit && (
        <div className="grid grid-cols-2 gap-3">
          <SideTallyControls
            label={teamA}
            players={playersA}
            score={gA}
            onPlus={() => bump('a', 1)}
            onMinus={() => bump('a', -1)}
            plusBusy={busy === 'a+'}
            minusBusy={busy === 'a-'}
            disabled={!!busy}
          />
          <SideTallyControls
            label={teamB}
            players={playersB}
            score={gB}
            onPlus={() => bump('b', 1)}
            onMinus={() => bump('b', -1)}
            plusBusy={busy === 'b+'}
            minusBusy={busy === 'b-'}
            disabled={!!busy}
          />
        </div>
      )}

      {scoringActive && canEdit && (
        <div className="flex flex-col gap-2 pt-1 border-t border-gray-800/60">
          <button
            type="button"
            onClick={() => endMatch(false)}
            disabled={!!busy}
            className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold px-3 py-2.5 rounded-xl"
          >
            {busy === 'end' ? <Loader2 size={14} className="animate-spin" /> : <Trophy size={14} />}
            {leaderName
              ? `End match — ${leaderName} wins (${Math.max(gA, gB)}-${Math.min(gA, gB)})`
              : gA === 0 && gB === 0
                ? 'End match'
                : `End — tied at ${gA}-${gB}`}
          </button>
          <button
            type="button"
            onClick={() => endMatch(true)}
            disabled={!!busy}
            className="inline-flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 self-center"
          >
            {busy === 'end-noresult' ? <Loader2 size={11} className="animate-spin" /> : <Flag size={11} />}
            End — no result
          </button>
        </div>
      )}

      {isCompleted && !scoringActive && (
        <div className={`rounded-2xl border p-4 flex flex-col items-center gap-1.5 ${
          winnerName ? 'bg-emerald-900/30 border-emerald-800/60' : 'bg-gray-900 border-gray-800'
        }`}>
          {winnerName ? (
            <>
              <Trophy size={28} className="text-emerald-300" />
              <p className="text-base font-bold text-white">{winnerName} won</p>
              <p className="text-[11px] text-gray-400">Final tally · {teamA} {gA} — {gB} {teamB}</p>
            </>
          ) : (
            <>
              <Flag size={20} className="text-gray-500" />
              <p className="text-sm text-gray-300">Match ended without a result</p>
              <p className="text-[11px] text-gray-500">{teamA} {gA} — {gB} {teamB}</p>
            </>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={reopen}
              disabled={busy === 'reopen'}
              className="text-xs text-gray-500 hover:text-white inline-flex items-center justify-center gap-1 mt-2"
            >
              {busy === 'reopen' ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
              Reopen match
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function SideTallyControls({
  label, players, score, onPlus, onMinus, plusBusy, minusBusy, disabled,
}: {
  label: string;
  players: MatchPlayer[];
  score: number;
  onPlus: () => void;
  onMinus: () => void;
  plusBusy: boolean;
  minusBusy: boolean;
  disabled: boolean;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3 flex flex-col gap-2">
      <div className="text-center">
        <p className="text-sm font-bold text-white truncate">{label}</p>
        {players.length > 0 && (
          <p className="text-[10px] text-gray-500 truncate">
            {players.map(p => p.name).join(', ')}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 justify-center">
        <button
          type="button"
          onClick={onMinus}
          disabled={disabled || score === 0}
          aria-label="Undo last game"
          className="w-9 h-9 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-300 flex items-center justify-center"
        >
          {minusBusy ? <Loader2 size={14} className="animate-spin" /> : <Minus size={14} />}
        </button>
        <button
          type="button"
          onClick={onPlus}
          disabled={disabled}
          aria-label="Game won"
          className="flex-1 h-12 rounded-xl bg-emerald-700/30 hover:bg-emerald-600/40 disabled:opacity-50 text-emerald-200 font-bold text-sm flex items-center justify-center gap-1.5 border border-emerald-800/60"
        >
          {plusBusy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Game won
        </button>
      </div>
    </div>
  );
}
