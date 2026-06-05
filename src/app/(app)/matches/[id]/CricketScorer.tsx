'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { offlineMutate } from '@/lib/offline/mutate';
import { reloadMatchClean } from '@/lib/matchNav';
import Card from '@/components/ui/Card';
import { Plus, X, ChevronDown, Trophy, Target } from 'lucide-react';
import { Match, MatchScore, MatchPlayer, CricketPlayerStat } from '@/types';
import PlayerSearchAndAdd, { type PlayerAddResult } from '@/components/PlayerSearchAndAdd';
import SpeedGunLauncher from '@/components/SpeedGunLauncher';
import { emitMatchScoreUpdate } from '@/lib/matchLiveBus';

interface Props {
  match: Match;
  scoreA: MatchScore | null;
  scoreB: MatchScore | null;
  canEdit: boolean;
  /** When set, completed + disputed matches still show full scoring UI for the scorer. */
  allowDisputeRecheck?: boolean;
  /** Admin: allow full scoring UI on completed matches. */
  adminOverrideCompleted?: boolean;
  matchPlayers: MatchPlayer[];
  playerStats: Record<string, CricketPlayerStat>;
}

const WICKET_TYPES = ['Bowled', 'LBW', 'Caught', 'Run Out', 'Stumped', 'Hit Wicket'];
const RUN_BTNS = [0, 1, 2, 3, 4, 6];

// Cricket overs helpers: 1.3 = 1 complete over + 3 balls = 9 total balls
function oversTooBalls(overs: number): number {
  const complete = Math.floor(overs);
  const partial = Math.round((overs - complete) * 10);
  return complete * 6 + partial;
}

function ballsToOvers(balls: number): number {
  return parseFloat(`${Math.floor(balls / 6)}.${balls % 6}`);
}

// Impact score for MVP ranking
function impactScore(s: CricketPlayerStat): number {
  return s.runs_scored + 20 * s.wickets_taken + 10 * s.catches_taken;
}

// Display helper: prefix numeric-only team names so they don't look like scores
function teamLabel(name: string): string {
  return /^\d+$/.test(name.trim()) ? `Team ${name.trim()}` : name;
}

// Cricket display formatters
function crr(runs: number, oversFaced: number): string {
  const balls = oversTooBalls(oversFaced);
  if (balls === 0) return '0.00';
  return ((runs / balls) * 6).toFixed(2);
}

function strikeRate(runs: number, balls: number): string {
  if (balls === 0) return '0.0';
  return ((runs / balls) * 100).toFixed(1);
}

function economy(runsConceded: number, ballsBowled: number): string {
  if (ballsBowled === 0) return '0.00';
  return ((runsConceded / ballsBowled) * 6).toFixed(2);
}

export default function CricketScorer({
  match,
  scoreA: initA,
  scoreB: initB,
  canEdit,
  allowDisputeRecheck = false,
  adminOverrideCompleted = false,
  matchPlayers: initPlayers,
  playerStats: initStats,
}: Props) {
  const supabase = createClient();
  const isLive = match.status === 'live';
  const scoringActive =
    isLive
    || (match.status === 'completed' && (allowDisputeRecheck || adminOverrideCompleted));

  const [players, setPlayers] = useState<MatchPlayer[]>(initPlayers);
  const [stats, setStats] = useState<Record<string, CricketPlayerStat>>(initStats);
  const [scoreA, setScoreA] = useState(initA);
  const [scoreB, setScoreB] = useState(initB);

  // Broadcast every optimistic score change so MatchHero (rendered above)
  // stays in sync with the scorer's local state.
  useEffect(() => {
    emitMatchScoreUpdate(match.id, scoreA, scoreB);
  }, [match.id, scoreA, scoreB]);

  const [battingTeam, setBattingTeamState] = useState<string | null>(match.batting_team_name ?? null);
  const [strikerId, setStrikerId] = useState<string | null>(match.striker_id ?? null);
  const [nonStrikerId, setNonStrikerId] = useState<string | null>(match.non_striker_id ?? null);
  const [bowlerId, setBowlerId] = useState<string | null>(match.bowler_id ?? null);
  const [innings, setInnings] = useState<number>(match.current_innings ?? 1);

  const [wicketOpen, setWicketOpen] = useState(false);
  const [wicketType, setWicketType] = useState('Bowled');
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [catcherId, setCatcherId] = useState<string | null>(null);

  // 'a' | 'b' | null — avoids undefined===undefined bug with missing team IDs
  const [declareOpen, setDeclareOpen] = useState(false);
  const [winnerSide, setWinnerSide] = useState<'a' | 'b' | null>(null);
  const [allOutMsg, setAllOutMsg] = useState<string | null>(null);

  // Match-day "+ Add player" → opens the shared PlayerSearchAndAdd against
  // a chosen team. The full search/create-placeholder/dedup behaviour lives
  // in that component (see CLAUDE.md "Reuse rule"); we just supply the
  // onAdd callback that wires the picked player_id into match_players via
  // the offline mutation queue.
  const [addTeam, setAddTeam] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const battingScore = battingTeam === match.team_a_name ? scoreA : scoreB;
  const battingPlayers = players.filter(p => p.team_name === battingTeam);
  const bowlingPlayers = players.filter(p => p.team_name !== battingTeam && p.team_name !== '');
  const allPlayers = players.filter(p => p.team_name !== '');
  const getStats = (id: string | null): CricketPlayerStat =>
    (id && stats[id]) ? stats[id] : { runs_scored: 0, wickets_taken: 0, catches_taken: 0 };

  const canScore = !!(strikerId && nonStrikerId && bowlerId);

  // In 2nd innings: runs the batting team needs to exceed to win
  const targetRuns = innings === 2 && battingTeam
    ? (battingTeam === match.team_a_name ? (scoreB?.runs ?? 0) : (scoreA?.runs ?? 0)) + 1
    : null;

  // Max wickets before all-out (team size - 1, min 1)
  const maxWickets = battingPlayers.length >= 2 ? battingPlayers.length - 1 : 10;

  function patchScore(team: string, patch: Partial<MatchScore>) {
    if (team === match.team_a_name) setScoreA(p => p ? { ...p, ...patch } : p);
    else setScoreB(p => p ? { ...p, ...patch } : p);
  }

  async function saveMatchState(patch: Record<string, unknown>) {
    await offlineMutate(supabase, {
      kind: 'update', table: 'matches', values: patch, where: { id: match.id },
    }, match.id);
  }

  async function upsertStat(pid: string, delta: Partial<CricketPlayerStat>) {
    const cur = getStats(pid);
    const next: CricketPlayerStat = {
      runs_scored:   cur.runs_scored   + (delta.runs_scored   ?? 0),
      wickets_taken: cur.wickets_taken + (delta.wickets_taken ?? 0),
      catches_taken: cur.catches_taken + (delta.catches_taken ?? 0),
      balls_faced:   (cur.balls_faced   ?? 0) + (delta.balls_faced   ?? 0),
      fours:         (cur.fours         ?? 0) + (delta.fours         ?? 0),
      sixes:         (cur.sixes         ?? 0) + (delta.sixes         ?? 0),
      balls_bowled:  (cur.balls_bowled  ?? 0) + (delta.balls_bowled  ?? 0),
      runs_conceded: (cur.runs_conceded ?? 0) + (delta.runs_conceded ?? 0),
      is_out:        delta.is_out    ?? cur.is_out    ?? false,
      dismissal:     delta.dismissal ?? cur.dismissal ?? null,
    };
    setStats(p => ({ ...p, [pid]: next }));
    await offlineMutate(supabase, {
      kind: 'upsert',
      table: 'player_match_stats',
      values: { match_id: match.id, player_id: pid, sport: 'cricket', ...next },
      onConflict: 'match_id,player_id',
    }, match.id);
  }

  /**
   * Bumps the legal-ball counter and overs.
   * Returns true if this ball completed an over — caller is responsible for
   * (a) end-of-over striker swap and (b) clearing the bowler. Keeping the
   * over-end side-effects at call sites lets handleRuns/confirmWicket
   * compose them with the odd-run swap and wicket-dismissal logic in one
   * deterministic sequence.
   */
  async function incrementBall(): Promise<boolean> {
    if (!battingScore || !battingTeam) return false;
    const totalBalls = oversTooBalls(battingScore.overs_faced ?? 0) + 1;
    const newOvers = ballsToOvers(totalBalls);
    await offlineMutate(supabase, {
      kind: 'update', table: 'match_scores', values: { overs_faced: newOvers }, where: { id: battingScore.id },
    }, match.id);
    patchScore(battingTeam, { overs_faced: newOvers });
    return totalBalls % 6 === 0;
  }

  // Auto-detect game end: chase complete OR all-out
  function checkChaseComplete(newRuns: number, team: string) {
    if (innings !== 2) return;
    const opponentRuns = team === match.team_a_name ? (scoreB?.runs ?? 0) : (scoreA?.runs ?? 0);
    if (newRuns > opponentRuns) {
      // Chase complete — chasing team wins
      setWinnerSide(team === match.team_a_name ? 'a' : 'b');
      setDeclareOpen(true);
    }
  }

  async function checkAllOut(newWickets: number) {
    if (battingPlayers.length < 2) return;
    if (newWickets < maxWickets) return;

    if (innings === 1) {
      // All out in 1st innings — auto-switch to 2nd innings
      const newBatting = battingTeam === match.team_a_name ? match.team_b_name : match.team_a_name;
      const allOutRuns = battingScore?.runs ?? 0;
      const allOutOvers = battingScore?.overs_faced ?? 0;
      setBattingTeamState(newBatting);
      setStrikerId(null); setNonStrikerId(null); setBowlerId(null);
      setInnings(2);
      await saveMatchState({
        batting_team_name: newBatting,
        striker_id: null, non_striker_id: null, bowler_id: null,
        current_innings: 2,
      });
      setAllOutMsg(
        `${battingTeam} all out for ${allOutRuns}/${newWickets} in ${allOutOvers} overs. ` +
        `${newBatting} need ${allOutRuns + 1} to win.`
      );
    } else {
      // All out in 2nd innings — defending team wins
      setWinnerSide(battingTeam === match.team_a_name ? 'b' : 'a');
      setDeclareOpen(true);
    }
  }

  // ── actions ───────────────────────────────────────────────────────────────

  async function setBatting(team: string) {
    setBattingTeamState(team);
    setStrikerId(null); setNonStrikerId(null); setBowlerId(null);
    await saveMatchState({ batting_team_name: team, striker_id: null, non_striker_id: null, bowler_id: null });
  }

  async function handleRuns(runs: number, isExtra = false) {
    if (!battingScore || !battingTeam || busy) return;
    setBusy(true);
    const newRuns = (battingScore.runs ?? 0) + runs;
    await offlineMutate(supabase, {
      kind: 'update', table: 'match_scores', values: { runs: newRuns }, where: { id: battingScore.id },
    }, match.id);
    patchScore(battingTeam, { runs: newRuns });

    if (!isExtra && strikerId) await upsertStat(strikerId, {
      runs_scored: runs,
      balls_faced: 1,
      fours: runs === 4 ? 1 : 0,
      sixes: runs === 6 ? 1 : 0,
    });
    if (!isExtra && bowlerId) await upsertStat(bowlerId, {
      balls_bowled: 1,
      runs_conceded: runs,
    });

    // Cricket striker rotation:
    //   - Odd runs (1, 3, 5): batsmen physically cross while running, so
    //     positions swap.
    //   - End of over: the bowler bowls from the opposite end, so the
    //     striker's-end and non-striker's-end labels swap.
    //   - Both happening at once (e.g. 1 run on ball 6) cancel out — net
    //     no change. We just compose them in sequence.
    // Wides + no-balls (isExtra) don't count as legal balls and don't
    // increment the over, so neither rule applies.
    let newStriker = strikerId;
    let newNonStriker = nonStrikerId;
    let isEndOfOver = false;

    if (!isExtra) {
      isEndOfOver = await incrementBall();
      if (runs % 2 === 1) [newStriker, newNonStriker] = [newNonStriker, newStriker];
      if (isEndOfOver) [newStriker, newNonStriker] = [newNonStriker, newStriker];
    }

    if (newStriker !== strikerId || newNonStriker !== nonStrikerId || isEndOfOver) {
      setStrikerId(newStriker);
      setNonStrikerId(newNonStriker);
      if (isEndOfOver) setBowlerId(null);
      await saveMatchState({
        striker_id: newStriker,
        non_striker_id: newNonStriker,
        ...(isEndOfOver ? { bowler_id: null } : {}),
      });
    }

    // Check if chase is complete (applies to extras too — e.g. winning wide)
    checkChaseComplete(newRuns, battingTeam);

    setBusy(false);
  }

  async function confirmWicket() {
    if (!battingScore || !battingTeam || busy) return;
    setBusy(true);
    const newWickets = (battingScore.wickets ?? 0) + 1;
    await offlineMutate(supabase, {
      kind: 'update', table: 'match_scores', values: { wickets: newWickets }, where: { id: battingScore.id },
    }, match.id);
    patchScore(battingTeam, { wickets: newWickets });

    // Bowler: credit wicket (unless run out) + delivery ball
    if (bowlerId) await upsertStat(bowlerId, {
      balls_bowled: 1,
      wickets_taken: wicketType === 'Run Out' ? 0 : 1,
    });
    if (wicketType === 'Caught' && catcherId) await upsertStat(catcherId, { catches_taken: 1 });

    // Record dismissal on the dismissed batter (IPL-style string)
    if (dismissedId) {
      const bowlerName  = players.find(p => p.player_id === bowlerId)?.name ?? '?';
      const catcherName = players.find(p => p.player_id === catcherId)?.name ?? '?';
      const dismissal =
        wicketType === 'Bowled'     ? `b ${bowlerName}` :
        wicketType === 'LBW'        ? `lbw b ${bowlerName}` :
        wicketType === 'Caught'     ? `c ${catcherName} b ${bowlerName}` :
        wicketType === 'Run Out'    ? `run out` :
        wicketType === 'Stumped'    ? `st b ${bowlerName}` :
        wicketType === 'Hit Wicket' ? `hit wkt b ${bowlerName}` :
        'out';
      await upsertStat(dismissedId, { is_out: true, dismissal });
    }

    // Whoever's out gets nulled; the surviving batsman keeps their end.
    let newStriker = dismissedId === strikerId ? null : strikerId;
    let newNonStriker = dismissedId === nonStrikerId ? null : nonStrikerId;

    // The wicket itself counts as a legal ball — increment first, then
    // apply end-of-over swap (so an over ending with a wicket leaves the
    // surviving batsman at the correct end for the new bowler's first ball).
    const isEndOfOver = await incrementBall();
    if (isEndOfOver) [newStriker, newNonStriker] = [newNonStriker, newStriker];

    setStrikerId(newStriker);
    setNonStrikerId(newNonStriker);
    if (isEndOfOver) setBowlerId(null);
    await saveMatchState({
      striker_id: newStriker,
      non_striker_id: newNonStriker,
      ...(isEndOfOver ? { bowler_id: null } : {}),
    });

    setWicketOpen(false); setCatcherId(null);
    setBusy(false);

    // Check all-out after all state is updated
    await checkAllOut(newWickets);
  }

  async function closeInnings() {
    if (innings === 1) {
      const newBatting = battingTeam === match.team_a_name ? match.team_b_name : match.team_a_name;
      setBattingTeamState(newBatting);
      setStrikerId(null); setNonStrikerId(null); setBowlerId(null);
      setInnings(2);
      await saveMatchState({
        batting_team_name: newBatting,
        striker_id: null, non_striker_id: null, bowler_id: null,
        current_innings: 2,
      });
    } else {
      const aRuns = scoreA?.runs ?? 0;
      const bRuns = scoreB?.runs ?? 0;
      setWinnerSide(aRuns > bRuns ? 'a' : bRuns > aRuns ? 'b' : null);
      setDeclareOpen(true);
    }
  }

  async function confirmDeclare() {
    setBusy(true);
    const winnerId   = winnerSide === 'a' ? match.team_a_id   : winnerSide === 'b' ? match.team_b_id   : null;
    const winnerName = winnerSide === 'a' ? match.team_a_name : winnerSide === 'b' ? match.team_b_name : null;
    await offlineMutate(supabase, {
      kind: 'update',
      table: 'matches',
      values: {
        winner_team_id:   winnerId ?? null,
        winner_team_name: winnerName ?? null,
        status: 'completed',
      },
      where: { id: match.id },
    }, match.id);
    reloadMatchClean();
  }

  /**
   * Wired into PlayerSearchAndAdd's onAdd callback. The shared component
   * has already resolved the player (search-pick or freshly-created
   * placeholder via /api/auth/create-placeholder-player); we just attach
   * them to the chosen team via the offline mutation queue.
   */
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

    setPlayers(p => [
      ...p,
      { id: crypto.randomUUID(), match_id: match.id, player_id: playerId, team_name: team, name: displayName },
    ]);
    return { ok: true };
  }

  async function removePlayer(mp: MatchPlayer) {
    await offlineMutate(supabase, {
      kind: 'delete',
      table: 'match_players',
      where: { match_id: match.id, player_id: mp.player_id },
    }, match.id);
    setPlayers(p => p.filter(x => x.player_id !== mp.player_id));
  }

  async function changeSelect(setter: (v: string | null) => void, key: string, val: string) {
    const v = val || null;
    setter(v);
    await saveMatchState({ [key]: v });
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">

      {allowDisputeRecheck && (
        <div className="rounded-xl border border-amber-700/50 bg-amber-950/35 px-3 py-2.5 text-sm text-amber-100">
          <span className="font-semibold text-amber-300">Disputed — scorer recheck</span>
          {' '}
          Correct runs, wickets, or players below. Saving updates clears disputes and asks everyone to confirm again.
        </div>
      )}

      {/* ── Innings status strip — only meaningful while live; hero owns the
          final score on completed matches, so we hide this then. ── */}
      {match.status === 'live' && (
        <div className="grid grid-cols-2 gap-3">
          {([
            { score: scoreA, team: match.team_a_name },
            { score: scoreB, team: match.team_b_name },
          ] as { score: MatchScore | null; team: string }[]).map(({ score, team }) => {
            const isBatting = battingTeam === team;
            const hasBatted = (score?.runs ?? 0) > 0 || (score?.overs_faced ?? 0) > 0;
            const finishedBatting = !isBatting && innings === 2 && hasBatted;
            const yetToBat = !isBatting && !finishedBatting && !hasBatted;

            return (
              <Card key={team} padding="md"
                className={isBatting ? 'border-emerald-700 bg-emerald-950/15' : ''}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-400 truncate">{teamLabel(team)}</p>
                  {isBatting && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold uppercase tracking-wider shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Batting
                    </span>
                  )}
                  {finishedBatting && (
                    <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider shrink-0">
                      Innings 1
                    </span>
                  )}
                  {yetToBat && (
                    <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider shrink-0">
                      Yet to bat
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1.5">
                  {yetToBat
                    ? 'Innings 2'
                    : isBatting
                      ? `${score?.overs_faced ?? 0} ov · CRR ${crr(score?.runs ?? 0, score?.overs_faced ?? 0)}`
                      : `${score?.overs_faced ?? 0} ov`}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Chase target banner (2nd innings) ── */}
      {canEdit && scoringActive && innings === 2 && battingTeam && targetRuns !== null && (
        <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target size={14} className="text-blue-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-300">
                Target: <span className="text-white">{targetRuns} runs</span>
              </p>
              <p className="text-xs text-gray-500">
                {battingTeam} need{' '}
                <span className="text-blue-400 font-medium">
                  {Math.max(0, targetRuns - (battingScore?.runs ?? 0))} more
                </span>
                {' '}in {innings === 2 ? 'this innings' : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── All-out notification ── */}
      {allOutMsg && (
        <div className="bg-orange-950/30 border border-orange-800/50 rounded-xl px-4 py-3 flex items-start justify-between gap-2">
          <p className="text-sm text-orange-300">{allOutMsg}</p>
          <button onClick={() => setAllOutMsg(null)} className="text-gray-500 hover:text-gray-300 shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Post-match MVP Leaderboard + summary ──
          Shown for any completed match — including admin edit / dispute
          recheck mode, so the scorer can cross-check the canonical match
          state against their edits. */}
      {match.status === 'completed' && allPlayers.length > 0 && (
        <MVPLeaderboard players={allPlayers} stats={stats} getStats={getStats} />
      )}

      {match.status === 'completed' && players.length > 0 && (
        <PostMatchSummary
          players={players} stats={stats}
          match={match} scoreA={scoreA} scoreB={scoreB}
        />
      )}

      {/* ── Read-only scorecard (live match, non-editor) ── */}
      {match.status === 'live' && (!canEdit || !scoringActive) && players.length > 0 && (
        <PlayerScorecard players={players} stats={stats} teamA={match.team_a_name} teamB={match.team_b_name} />
      )}

      {canEdit && scoringActive && (
        <>
          {/* ── Choose batting team ── */}
          {!battingTeam && (
            <Card padding="md" className="text-center">
              <p className="text-sm text-gray-400 mb-3">Who is batting first?</p>
              <div className="flex gap-2 justify-center">
                {[match.team_a_name, match.team_b_name].map(t => (
                  <button key={t} onClick={() => setBatting(t)}
                    className="flex-1 py-2 px-3 bg-emerald-700 hover:bg-emerald-600 text-white text-sm rounded-xl font-medium">
                    {t}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {battingTeam && (
            <>
              {/* ── Now Batting (IPL-style striker emphasis) ── */}
              <Card padding="md">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Now Batting</h3>
                  {strikerId && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      On strike
                    </span>
                  )}
                </div>

                {/* Two-column batsman grid: striker (emerald) + non-striker (muted).
                    excludeId on each side hides the other batsman from that
                    slot's dropdown — same player can't be on both sides. */}
                <div className="grid grid-cols-2 gap-2 mb-2.5">
                  <BatsmanSlot
                    role="striker"
                    options={battingPlayers}
                    value={strikerId}
                    excludeId={nonStrikerId}
                    stats={strikerId ? getStats(strikerId) : null}
                    onChange={v => changeSelect(setStrikerId, 'striker_id', v)}
                  />
                  <BatsmanSlot
                    role="non-striker"
                    options={battingPlayers}
                    value={nonStrikerId}
                    excludeId={strikerId}
                    stats={nonStrikerId ? getStats(nonStrikerId) : null}
                    onChange={v => changeSelect(setNonStrikerId, 'non_striker_id', v)}
                  />
                </div>

                {/* Bowler row (full width) */}
                <BowlerSlot
                  options={bowlingPlayers}
                  value={bowlerId}
                  stats={bowlerId ? getStats(bowlerId) : null}
                  onChange={v => changeSelect(setBowlerId, 'bowler_id', v)}
                />

                {bowlerId && scoringActive && (
                  <div className="mt-2 flex items-center justify-end">
                    <SpeedGunLauncher
                      variant="icon"
                      matchId={match.id}
                    />
                  </div>
                )}

                {battingPlayers.length === 0 && (
                  <p className="text-xs text-amber-600 mt-2.5">↓ Add players to {battingTeam} in Match Players below</p>
                )}
              </Card>

              {/* ── Scoring buttons ── */}
              <Card padding="md">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">
                    Score
                    <span className="text-xs text-gray-500 font-normal ml-1.5">
                      {innings === 1 ? '1st Innings' : '2nd Innings'}
                    </span>
                  </h3>
                  <span className="text-xs text-gray-500">{battingTeam} batting</span>
                </div>

                {!canScore && (
                  <p className="text-xs text-amber-500 text-center py-2 mb-2 bg-amber-950/20 rounded-lg border border-amber-900/40">
                    Select striker, non-striker &amp; bowler to score
                  </p>
                )}

                <div className="grid grid-cols-6 gap-2 mb-2">
                  {RUN_BTNS.map(r => (
                    <button key={r} onClick={() => handleRuns(r)} disabled={busy || !canScore}
                      className={`py-3 rounded-xl font-bold text-lg transition-all disabled:opacity-30 ${
                        r === 4
                          ? 'bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-900/40'
                          : r === 6
                          ? 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white shadow-lg shadow-fuchsia-900/40'
                          : 'bg-gray-800 hover:bg-gray-700 text-white'
                      }`}>
                      {r}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => handleRuns(1, true)} disabled={busy || !canScore}
                    className="py-2.5 rounded-xl text-sm font-semibold bg-yellow-900/40 hover:bg-yellow-900/70 border border-yellow-700 text-yellow-300 disabled:opacity-30">
                    Wide (+1)
                  </button>
                  <button onClick={() => handleRuns(1, true)} disabled={busy || !canScore}
                    className="py-2.5 rounded-xl text-sm font-semibold bg-orange-900/40 hover:bg-orange-900/70 border border-orange-700 text-orange-300 disabled:opacity-30">
                    No Ball
                  </button>
                  <button
                    onClick={() => { setDismissedId(strikerId); setWicketOpen(true); }}
                    disabled={busy || !canScore}
                    className="py-2.5 rounded-xl text-sm font-bold bg-red-700 hover:bg-red-600 text-white disabled:opacity-30">
                    WICKET 🏏
                  </button>
                </div>

                {/* Close innings */}
                <div className="mt-3 pt-3 border-t border-gray-800">
                  <button onClick={closeInnings} disabled={busy}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 text-gray-300 disabled:opacity-40 transition-colors">
                    {innings === 1 ? 'Close 1st Innings →' : 'End Match & Declare Winner'}
                  </button>
                </div>
              </Card>
            </>
          )}

          {/* ── Match players ── */}
          <Card padding="md">
            <h3 className="text-sm font-semibold text-white mb-3">Match Players</h3>
            <div className="grid grid-cols-2 gap-4">
              {[match.team_a_name, match.team_b_name].map(team => (
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
                        <span className="text-xs text-white">{p.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {s.runs_scored > 0 && `${s.runs_scored}r `}
                            {s.wickets_taken > 0 && `${s.wickets_taken}w `}
                            {s.catches_taken > 0 && `${s.catches_taken}c`}
                          </span>
                          <button onClick={() => removePlayer(p)} className="text-gray-700 hover:text-red-400 transition-colors">
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

            {/* Search & add — shared component (CLAUDE.md "Reuse rule") */}
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
                <button
                  type="button"
                  onClick={() => setAddTeam(null)}
                  className="mt-2 text-xs text-gray-600 hover:text-gray-400"
                >
                  Cancel
                </button>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ── Wicket modal ── */}
      {wicketOpen && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-lg font-bold text-white mb-4">🏏 Wicket</h3>

            <div className="mb-4">
              <p className="text-xs text-gray-400 mb-2">Dismissal type</p>
              <div className="flex flex-wrap gap-1.5">
                {WICKET_TYPES.map(t => (
                  <button key={t} onClick={() => setWicketType(t)}
                    className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                      wicketType === t ? 'bg-red-700 text-white font-medium' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <p className="text-xs text-gray-400 mb-1">Dismissed batsman</p>
              <PlayerDropdown options={battingPlayers} value={dismissedId}
                placeholder="— select batsman —" onChange={setDismissedId} />
            </div>

            {wicketType === 'Caught' && (
              <div className="mb-4">
                <p className="text-xs text-gray-400 mb-1">Caught by</p>
                <PlayerDropdown options={bowlingPlayers} value={catcherId}
                  placeholder="— select fielder —" onChange={setCatcherId} />
              </div>
            )}

            {wicketType !== 'Run Out' && bowlerId && (
              <p className="text-xs text-gray-500 mb-4">
                Wicket to: <span className="text-white">{players.find(p => p.player_id === bowlerId)?.name}</span>
              </p>
            )}

            <div className="flex gap-2">
              <button onClick={() => setWicketOpen(false)} className="flex-1 py-2 rounded-xl bg-gray-800 text-gray-300 text-sm">Cancel</button>
              <button onClick={confirmWicket} disabled={busy}
                className="flex-1 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white font-bold text-sm disabled:opacity-40">
                {busy ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Declare winner modal ── */}
      {declareOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-lg font-bold text-white mb-1">🏆 End of Match</h3>
            <p className="text-sm text-gray-400 mb-4">
              {innings === 2
                ? 'Select the winner to complete the match.'
                : 'Declare the winner.'}
            </p>

            <div className="grid grid-cols-2 gap-2 mb-3">
              {([
                { side: 'a' as const, team: match.team_a_name, score: scoreA },
                { side: 'b' as const, team: match.team_b_name, score: scoreB },
              ]).map(({ side, team, score }) => (
                <button key={side} onClick={() => setWinnerSide(winnerSide === side ? null : side)}
                  className={`rounded-xl p-3 border text-left transition-colors ${
                    winnerSide === side
                      ? 'border-emerald-500 bg-emerald-950/40'
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                  }`}>
                  <p className="text-xs text-gray-400 mb-1 truncate">{teamLabel(team)}</p>
                  <p className="text-2xl font-bold text-white">{score?.runs ?? 0}/{score?.wickets ?? 0}</p>
                  <p className="text-xs text-gray-500">{score?.overs_faced ?? 0} ov</p>
                  {winnerSide === side && (
                    <p className="text-xs text-emerald-400 font-semibold mt-1">✓ Winner</p>
                  )}
                </button>
              ))}
            </div>

            <button onClick={() => setWinnerSide(null)}
              className={`w-full text-sm py-2 rounded-lg mb-4 transition-colors border ${
                winnerSide === null
                  ? 'bg-gray-700 text-white border-gray-500'
                  : 'text-gray-500 border-transparent hover:text-gray-400'
              }`}>
              No result (draw / abandoned)
            </button>

            <div className="flex gap-2">
              <button onClick={() => setDeclareOpen(false)} className="flex-1 py-2 rounded-xl bg-gray-800 text-gray-300 text-sm">Cancel</button>
              <button onClick={confirmDeclare} disabled={busy}
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm disabled:opacity-40">
                {busy ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MVP Leaderboard (post-match) ─────────────────────────────────────────────

function MVPLeaderboard({ players, getStats }: {
  players: MatchPlayer[];
  stats: Record<string, CricketPlayerStat>;
  getStats: (id: string | null) => CricketPlayerStat;
}) {
  if (players.length === 0) return null;

  const ranked = [...players].sort((a, b) =>
    impactScore(getStats(b.player_id)) - impactScore(getStats(a.player_id))
  );
  const mvp = ranked[0];
  const bestBatsman = [...players].sort((a, b) =>
    getStats(b.player_id).runs_scored - getStats(a.player_id).runs_scored)[0];
  const bestBowler = [...players].sort((a, b) =>
    getStats(b.player_id).wickets_taken - getStats(a.player_id).wickets_taken)[0];

  const medalColor = (i: number) =>
    i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-600';
  const medalLabel = (i: number) =>
    i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;

  return (
    <Card padding="md" className="border-yellow-800/40 bg-yellow-950/5">
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={14} className="text-yellow-500" />
        <h3 className="text-sm font-semibold text-yellow-400">Match MVP Leaderboard</h3>
      </div>

      {/* Top 3 award cards */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-yellow-950/30 border border-yellow-800/40 rounded-xl p-2.5 text-center">
          <p className="text-lg mb-0.5">🏅</p>
          <p className="text-xs text-yellow-500 font-semibold">MVP</p>
          <p className="text-[10px] text-gray-500">Man of Match</p>
          <p className="text-xs text-white font-semibold mt-1 truncate">{mvp?.name}</p>
          <p className="text-xs text-yellow-600 mt-0.5">{impactScore(getStats(mvp?.player_id ?? ''))} pts</p>
        </div>
        <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-2.5 text-center">
          <p className="text-lg mb-0.5">🏏</p>
          <p className="text-xs text-emerald-400 font-semibold">Best Bat</p>
          <p className="text-[10px] text-gray-500">&nbsp;</p>
          <p className="text-xs text-white font-semibold mt-1 truncate">{bestBatsman?.name}</p>
          <p className="text-xs text-emerald-500 mt-0.5">{getStats(bestBatsman?.player_id ?? '').runs_scored} runs</p>
        </div>
        <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-2.5 text-center">
          <p className="text-lg mb-0.5">🎳</p>
          <p className="text-xs text-red-400 font-semibold">Best Bowl</p>
          <p className="text-[10px] text-gray-500">&nbsp;</p>
          <p className="text-xs text-white font-semibold mt-1 truncate">{bestBowler?.name}</p>
          <p className="text-xs text-red-400 mt-0.5">{getStats(bestBowler?.player_id ?? '').wickets_taken} wkts</p>
        </div>
      </div>

      {/* Ranked leaderboard */}
      <div className="flex flex-col divide-y divide-gray-800/60">
        {ranked.map((p, i) => {
          const s = getStats(p.player_id);
          const imp = impactScore(s);
          const isMVP = i === 0;
          const isBestBat = p.player_id === bestBatsman?.player_id && s.runs_scored > 0;
          const isBestBowl = p.player_id === bestBowler?.player_id && s.wickets_taken > 0;
          return (
            <div key={p.player_id}
              className={`flex items-center justify-between py-2 ${isMVP ? 'bg-yellow-950/15 rounded -mx-1 px-1' : ''}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-sm font-bold w-6 text-center shrink-0 ${medalColor(i)}`}>
                  {medalLabel(i)}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-white font-medium truncate">{p.name}</span>
                    {isMVP && <span className="text-[10px] bg-yellow-900/50 text-yellow-400 px-1.5 py-0.5 rounded font-semibold">MVP</span>}
                  </div>
                  <span className="text-[10px] text-gray-600">{p.team_name}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isBestBat && <span className="text-[10px] bg-emerald-900/40 text-emerald-400 px-1 py-0.5 rounded">🏏</span>}
                {isBestBowl && <span className="text-[10px] bg-red-900/40 text-red-400 px-1 py-0.5 rounded">🎳</span>}
                <div className="text-right ml-1">
                  <p className="text-xs">
                    {s.runs_scored > 0 && <span className="text-emerald-400">{s.runs_scored}r </span>}
                    {s.wickets_taken > 0 && <span className="text-red-400">{s.wickets_taken}w </span>}
                    {s.catches_taken > 0 && <span className="text-blue-400">{s.catches_taken}c</span>}
                  </p>
                  <p className={`text-xs font-bold ${isMVP ? 'text-yellow-400' : 'text-gray-600'}`}>{imp} pts</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-700 mt-3 text-center">
        Impact = runs + 20×wickets + 10×catches
      </p>
    </Card>
  );
}

// ── Post-match full summary (IPL-style scorecard) ────────────────────────────

function PostMatchSummary({ players, stats, match, scoreA, scoreB }: {
  players: MatchPlayer[];
  stats: Record<string, CricketPlayerStat>;
  match: Match;
  scoreA: MatchScore | null;
  scoreB: MatchScore | null;
}) {
  const [activeTab, setActiveTab] = useState<'a' | 'b'>('a');
  return <PostMatchSummaryInner
    players={players} stats={stats} match={match} scoreA={scoreA} scoreB={scoreB}
    activeTab={activeTab} setActiveTab={setActiveTab}
  />;
}

function PostMatchSummaryInner({ players, stats, match, scoreA, scoreB, activeTab, setActiveTab }: {
  players: MatchPlayer[];
  stats: Record<string, CricketPlayerStat>;
  match: Match;
  scoreA: MatchScore | null;
  scoreB: MatchScore | null;
  activeTab: 'a' | 'b';
  setActiveTab: (v: 'a' | 'b') => void;
}) {
  const teamAPlayers = players.filter(p => p.team_name === match.team_a_name);
  const teamBPlayers = players.filter(p => p.team_name === match.team_b_name);

  const runsA = scoreA?.runs ?? 0, runsB = scoreB?.runs ?? 0;
  const wktsA = scoreA?.wickets ?? 0, wktsB = scoreB?.wickets ?? 0;

  // Winner detection
  let winnerName: string | null = match.winner_team_name ?? null;
  if (!winnerName && match.winner_team_id) {
    if (match.winner_team_id === match.team_a_id) winnerName = match.team_a_name;
    else if (match.winner_team_id === match.team_b_id) winnerName = match.team_b_name;
  }
  if (!winnerName && !match.winner_team_id && !match.winner_team_name && runsA !== runsB) {
    winnerName = runsA > runsB ? match.team_a_name : match.team_b_name;
  }
  let winMargin = '';
  if (winnerName === match.team_a_name)
    winMargin = runsA > runsB ? `by ${runsA - runsB} runs` : `by ${Math.max(0, teamAPlayers.length - 1 - wktsA)} wkts`;
  else if (winnerName === match.team_b_name)
    winMargin = runsB > runsA ? `by ${runsB - runsA} runs` : `by ${Math.max(0, teamBPlayers.length - 1 - wktsB)} wkts`;

  // Active tab data
  const isA = activeTab === 'a';
  const batPlayers = isA ? teamAPlayers : teamBPlayers;
  const bowlTeamPlayers = isA ? teamBPlayers : teamAPlayers;
  const score = isA ? scoreA : scoreB;

  // Batters = players with any batting activity. If NOTHING is recorded for a team
  // (ad-hoc match, user just tapped run buttons without selecting strikers), fall
  // back to showing every team player so the scorecard isn't empty.
  const activeBatters = batPlayers.filter(p => {
    const s = stats[p.player_id];
    return s && (s.runs_scored > 0 || (s.balls_faced ?? 0) > 0 || s.is_out);
  });
  const batters = activeBatters.length > 0 ? activeBatters : batPlayers;
  const yetToBat = activeBatters.length > 0
    ? batPlayers.filter(p => !activeBatters.some(b => b.player_id === p.player_id))
    : [];

  // Bowlers = opposite team players with any bowling activity
  const bowlers = bowlTeamPlayers
    .filter(p => {
      const s = stats[p.player_id];
      return s && ((s.balls_bowled ?? 0) > 0 || s.wickets_taken > 0 || s.catches_taken > 0);
    })
    .sort((a, b) => {
      const diff = (stats[b.player_id]?.wickets_taken ?? 0) - (stats[a.player_id]?.wickets_taken ?? 0);
      if (diff !== 0) return diff;
      return (stats[b.player_id]?.balls_bowled ?? 0) - (stats[a.player_id]?.balls_bowled ?? 0);
    });

  return (
    <div className="flex flex-col gap-3">

      {/* Result banner */}
      {winnerName ? (
        <div className="bg-emerald-950/30 border border-emerald-700/50 rounded-xl px-4 py-3 text-center">
          <p className="text-base font-bold text-white">
            🏆 <span className="text-emerald-300">{teamLabel(winnerName)}</span>
            {winMargin && <span className="text-gray-400 font-normal"> won {winMargin}</span>}
          </p>
        </div>
      ) : (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-2.5 text-center">
          <p className="text-sm text-gray-400">Match ended — no result</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {([
          { id: 'a' as const, name: match.team_a_name, score: scoreA },
          { id: 'b' as const, name: match.team_b_name, score: scoreB },
        ]).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              activeTab === t.id
                ? 'border-white text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}>
            <span className="truncate block px-1">{teamLabel(t.name)}</span>
            <span className="text-xs font-normal text-gray-500">
              {t.score?.runs ?? 0}/{t.score?.wickets ?? 0} ({t.score?.overs_faced ?? 0} ov)
            </span>
          </button>
        ))}
      </div>

      {/* Batting panel */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_2rem_2rem_2rem_2rem_3rem] gap-1 px-4 py-2 border-b border-gray-800 bg-gray-800/30">
          <span className="text-[11px] text-gray-500 font-semibold uppercase">Batting</span>
          <span className="text-[10px] text-gray-500 text-right">R</span>
          <span className="text-[10px] text-gray-500 text-right">B</span>
          <span className="text-[10px] text-gray-500 text-right">4s</span>
          <span className="text-[10px] text-gray-500 text-right">6s</span>
          <span className="text-[10px] text-gray-500 text-right">S/R</span>
        </div>
        {batters.length === 0 && (
          <p className="px-4 py-3 text-xs text-gray-600 italic">No batting data recorded</p>
        )}
        {batters.map(p => {
          const s = stats[p.player_id] ?? { runs_scored: 0, wickets_taken: 0, catches_taken: 0 };
          const balls = s.balls_faced ?? 0;
          const sr = balls > 0 ? ((s.runs_scored / balls) * 100).toFixed(1) : '–';
          const is100 = s.runs_scored >= 100, is50 = s.runs_scored >= 50;
          return (
            <div key={p.player_id} className="grid grid-cols-[1fr_2rem_2rem_2rem_2rem_3rem] gap-1 items-center px-4 py-2.5 border-b border-gray-800/40 last:border-0">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-white font-medium truncate">{p.name}</span>
                  {is100 && <span className="text-[9px] bg-yellow-900/50 text-yellow-400 px-1 rounded font-bold shrink-0">💯</span>}
                  {!is100 && is50 && <span className="text-[9px] bg-emerald-900/40 text-emerald-400 px-1 rounded font-bold shrink-0">50+</span>}
                </div>
                <p className="text-[11px] text-gray-500 truncate mt-0.5">
                  {s.is_out ? (s.dismissal ?? 'out') : 'not out'}
                </p>
              </div>
              <span className={`text-xs text-right tabular-nums font-bold ${is100 ? 'text-yellow-400' : is50 ? 'text-emerald-400' : 'text-white'}`}>
                {s.runs_scored}
              </span>
              <span className="text-xs text-right tabular-nums text-gray-400">{balls || '–'}</span>
              <span className="text-xs text-right tabular-nums text-gray-400">{s.fours || '–'}</span>
              <span className="text-xs text-right tabular-nums text-gray-400">{s.sixes || '–'}</span>
              <span className="text-xs text-right tabular-nums text-gray-400">{sr}</span>
            </div>
          );
        })}

        {/* Team total row */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800/30 border-t border-gray-800">
          <span className="text-xs font-bold text-white uppercase tracking-wide">Total</span>
          <span className="text-sm font-bold text-white tabular-nums">
            {score?.runs ?? 0}/{score?.wickets ?? 0}
            <span className="text-xs text-gray-500 font-normal ml-1.5">({score?.overs_faced ?? 0} ov)</span>
          </span>
        </div>
      </div>

      {/* Yet to bat */}
      {yetToBat.length > 0 && (
        <div className="bg-gray-900/40 border border-gray-800 rounded-xl px-4 py-3">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Yet to bat</p>
          <p className="text-sm text-gray-300">{yetToBat.map(p => p.name).join(' · ')}</p>
        </div>
      )}

      {/* Bowling panel */}
      {bowlers.length > 0 && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_2.5rem_2rem_2rem_3rem] gap-1 px-4 py-2 border-b border-gray-800 bg-gray-800/30">
            <span className="text-[11px] text-gray-500 font-semibold uppercase">Bowling · {teamLabel(isA ? match.team_b_name : match.team_a_name)}</span>
            <span className="text-[10px] text-gray-500 text-right">O</span>
            <span className="text-[10px] text-gray-500 text-right">R</span>
            <span className="text-[10px] text-gray-500 text-right">W</span>
            <span className="text-[10px] text-gray-500 text-right">Econ</span>
          </div>
          {bowlers.map(p => {
            const s = stats[p.player_id] ?? { runs_scored: 0, wickets_taken: 0, catches_taken: 0 };
            const balls = s.balls_bowled ?? 0;
            const overs = balls > 0 ? ballsToOvers(balls) : '–';
            const runs = s.runs_conceded ?? 0;
            const econ = balls > 0 ? ((runs / balls) * 6).toFixed(2) : '–';
            const wkts = s.wickets_taken;
            return (
              <div key={p.player_id} className="grid grid-cols-[1fr_2.5rem_2rem_2rem_3rem] gap-1 items-center px-4 py-2.5 border-b border-gray-800/40 last:border-0">
                <span className="text-sm text-white font-medium truncate">{p.name}</span>
                <span className="text-xs text-right tabular-nums text-gray-300">{overs}</span>
                <span className="text-xs text-right tabular-nums text-gray-400">{runs || '–'}</span>
                <span className={`text-xs text-right tabular-nums font-bold ${wkts >= 3 ? 'text-red-400' : wkts > 0 ? 'text-orange-400' : 'text-gray-400'}`}>
                  {wkts}
                </span>
                <span className="text-xs text-right tabular-nums text-gray-400">{econ}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Read-only player scorecard ────────────────────────────────────────────────

function PlayerScorecard({ players, stats, teamA, teamB }: {
  players: MatchPlayer[];
  stats: Record<string, CricketPlayerStat>;
  teamA: string;
  teamB: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[teamA, teamB].map(team => (
        <Card key={team} padding="sm">
          <p className="text-xs font-semibold text-gray-400 mb-2">{teamLabel(team)}</p>
          {players.filter(p => p.team_name === team).map(p => {
            const s = stats[p.player_id] ?? { runs_scored: 0, wickets_taken: 0, catches_taken: 0 };
            return (
              <div key={p.player_id} className="flex justify-between py-0.5">
                <span className="text-xs text-white">{p.name}</span>
                <span className="text-xs text-gray-500">
                  {s.runs_scored > 0 && `${s.runs_scored}r `}
                  {s.wickets_taken > 0 && `${s.wickets_taken}w `}
                  {s.catches_taken > 0 && `${s.catches_taken}c`}
                </span>
              </div>
            );
          })}
        </Card>
      ))}
    </div>
  );
}

// ── Custom dropdown (replaces native <select> for cross-browser consistency) ──

function PlayerDropdown({ options, value, placeholder, onChange }: {
  options: MatchPlayer[];
  value: string | null;
  placeholder: string;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(p => p.player_id === value);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full bg-gray-800 border border-gray-700 text-sm rounded-lg px-3 py-2 text-left flex items-center justify-between">
        <span className={selected ? 'text-white' : 'text-gray-500'}>{selected?.name ?? placeholder}</span>
        <ChevronDown size={13} className="text-gray-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-xl">
          <button type="button" onClick={() => { onChange(null); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-700">{placeholder}</button>
          {options.map(p => (
            <button key={p.player_id} type="button" onClick={() => { onChange(p.player_id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 ${value === p.player_id ? 'text-emerald-400' : 'text-white'}`}>
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Batsman slot (IPL-style card with striker emphasis) ──────────────────────

function BatsmanSlot({ role, options, value, excludeId, stats, onChange }: {
  role: 'striker' | 'non-striker';
  options: MatchPlayer[];
  value: string | null;
  /** Hide this player from the dropdown — they're already in the other slot. */
  excludeId?: string | null;
  stats: CricketPlayerStat | null;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(p => p.player_id === value);
  const dropdownOptions = excludeId
    ? options.filter(p => p.player_id !== excludeId)
    : options;
  const isStriker = role === 'striker';
  const runs  = stats?.runs_scored ?? 0;
  const balls = stats?.balls_faced ?? 0;

  const wrapperCls = isStriker
    ? 'border-emerald-700 bg-emerald-950/25'
    : 'border-gray-700 bg-gray-800/40';
  const nameCls = selected
    ? (isStriker ? 'text-white font-bold' : 'text-gray-300')
    : 'text-gray-500';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full text-left rounded-xl border ${wrapperCls} px-3 py-2.5 transition-colors`}
      >
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${
            isStriker ? 'text-emerald-400' : 'text-gray-500'
          }`}>
            {isStriker ? '🏏 Striker' : 'Non-striker'}
          </span>
          <ChevronDown size={11} className="text-gray-500 shrink-0" />
        </div>
        <p className={`text-sm truncate ${nameCls}`}>
          {selected?.name ?? '— select —'}
          {isStriker && selected && <span className="text-emerald-400">*</span>}
        </p>
        {selected && (
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={`text-lg font-bold tabular-nums ${
              isStriker ? 'text-white' : 'text-gray-400'
            }`}>
              {runs}
            </span>
            <span className="text-xs text-gray-500 tabular-nums">({balls})</span>
            {balls > 0 && (
              <span className="text-[10px] text-gray-600 ml-auto tabular-nums">
                SR {strikeRate(runs, balls)}
              </span>
            )}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-xl">
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-700"
          >
            — select —
          </button>
          {dropdownOptions.map(p => (
            <button
              key={p.player_id}
              type="button"
              onClick={() => { onChange(p.player_id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 ${
                value === p.player_id ? 'text-emerald-400' : 'text-white'
              }`}
            >
              {p.name}
            </button>
          ))}
          {dropdownOptions.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-600 italic">No players — add below</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bowler slot (full-width row with red accent) ─────────────────────────────

function BowlerSlot({ options, value, stats, onChange }: {
  options: MatchPlayer[];
  value: string | null;
  stats: CricketPlayerStat | null;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(p => p.player_id === value);

  const wkts = stats?.wickets_taken ?? 0;
  const conceded = stats?.runs_conceded ?? 0;
  const ballsBowled = stats?.balls_bowled ?? 0;
  const oversBowled = ballsToOvers(ballsBowled);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-left rounded-xl border border-red-900/40 bg-red-950/15 px-3 py-2 flex items-center gap-3"
      >
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
            🎳 Bowler
          </span>
          <p className={`text-sm truncate ${selected ? 'text-white' : 'text-gray-500'}`}>
            {selected?.name ?? '— select —'}
          </p>
        </div>
        {selected && (
          <div className="text-right shrink-0">
            <div className="text-sm font-bold text-white tabular-nums">
              {wkts}/{conceded}
            </div>
            <div className="text-[10px] text-gray-500 tabular-nums">
              {oversBowled} ov
              {ballsBowled > 0 && <> · ER {economy(conceded, ballsBowled)}</>}
            </div>
          </div>
        )}
        <ChevronDown size={12} className="text-gray-500 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-xl">
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-700"
          >
            — select —
          </button>
          {options.map(p => (
            <button
              key={p.player_id}
              type="button"
              onClick={() => { onChange(p.player_id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 ${
                value === p.player_id ? 'text-emerald-400' : 'text-white'
              }`}
            >
              {p.name}
            </button>
          ))}
          {options.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-600 italic">No players — add below</p>
          )}
        </div>
      )}
    </div>
  );
}
