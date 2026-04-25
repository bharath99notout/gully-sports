'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertTriangle, ShieldAlert, Loader2, X } from 'lucide-react';
import ConfirmationBadge from '@/components/ConfirmationBadge';
import { describeConfirmationState, type ConfirmationState } from '@/lib/matchConfirmation';
import { confirmMatch, disputeMatch, forcePushMatch } from '@/app/actions/matchTrust';

interface Participant {
  player_id: string;
  name: string;
  team_name: string;
  status: 'pending' | 'confirmed' | 'disputed';
  disputed_reason?: string | null;
}

interface Props {
  matchId: string;
  matchState: ConfirmationState;
  autoConfirmAt: string | null;
  scoredById: string | null;
  scorerName: string | null;
  currentUserId: string | null;
  participants: Participant[];
  /** True when the viewer is the original scorer (used for force-push UI). */
  viewerIsScorer: boolean;
}

/**
 * The trust-state UI shown at the top of /matches/[id]:
 *   - Banner describing the current state
 *   - For participants who haven't responded: Confirm / Dispute buttons
 *   - For the scorer when disputed: Recheck (handled via existing edit flow) or Force push
 *   - List of all participants with their individual status
 *
 * Why a single component: keeps the trust workflow co-located so future
 * tweaks (different copy, more states) only touch one file.
 */
export default function MatchConfirmationPanel({
  matchId, matchState, autoConfirmAt, scoredById, scorerName,
  currentUserId, participants, viewerIsScorer,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [disputeFor, setDisputeFor] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');

  const meta = describeConfirmationState(matchState);

  const me = participants.find(p => p.player_id === currentUserId) ?? null;
  const myStatus = me?.status ?? null;
  const canRespond = !!me && myStatus === 'pending'
    && (matchState === 'pending' || matchState === 'disputed');

  async function respond(status: 'confirmed' | 'disputed', reason?: string) {
    if (!currentUserId || !me) return;
    setBusyAction(status);
    const result = status === 'confirmed'
      ? await confirmMatch(matchId)
      : await disputeMatch(matchId, reason ?? '');
    setBusyAction(null);
    if (!result.ok) {
      console.error('respond failed', result.error);
      alert(`Could not save your response: ${result.error}`);
      return;
    }
    setDisputeFor(null);
    setDisputeReason('');
    startTransition(() => router.refresh());
  }

  async function forcePush() {
    if (!viewerIsScorer) return;
    if (!confirm('Send this match to admin review? Stats stay live until admin decides.')) return;
    setBusyAction('force_push');
    const result = await forcePushMatch(matchId);
    setBusyAction(null);
    if (!result.ok) {
      console.error('force push failed', result.error);
      alert(`Could not force push: ${result.error}`);
      return;
    }
    startTransition(() => router.refresh());
  }

  // Show countdown for pending state
  let timeLeft: string | null = null;
  if (matchState === 'pending' && autoConfirmAt) {
    const ms = new Date(autoConfirmAt).getTime() - Date.now();
    if (ms > 0) {
      const hrs = Math.floor(ms / 3_600_000);
      const mins = Math.floor((ms % 3_600_000) / 60_000);
      timeLeft = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    }
  }

  // Don't render anything for confirmed matches — keeps the page clean for
  // the 99% happy path. (Stats/Match content remains visible.)
  if (matchState === 'confirmed') return null;

  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-3 ${
      meta.tone === 'danger'  ? 'bg-red-950/30 border-red-900/60' :
      meta.tone === 'warning' ? 'bg-amber-950/20 border-amber-900/50' :
                                'bg-gray-900 border-gray-800'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <ConfirmationBadge state={matchState} />
          <p className="text-sm text-gray-300 mt-2 leading-snug">
            {matchState === 'pending' && (
              <>
                <span className="font-semibold text-white">{scorerName ?? 'Someone'}</span> scored this match.
                Each participant should confirm or dispute it.
                {timeLeft && <> Otherwise it auto-confirms in <span className="text-amber-400 font-semibold">{timeLeft}</span>.</>}
                <span className="block text-gray-500 mt-1.5 text-xs">
                  Caliber and leaderboard only update after the match is confirmed (or auto-confirms).
                </span>
              </>
            )}
            {matchState === 'disputed' && (
              <>This match was disputed by at least one participant. The scorer should re-check the score or push it for admin review. <span className="text-gray-500">Caliber and leaderboard ignore this match until it is resolved.</span></>
            )}
            {matchState === 'force_pushed' && (
              <>The scorer has sent this match to admin review. An admin will approve or reject it. <span className="text-gray-500">Caliber and leaderboard stay paused until approved.</span></>
            )}
            {matchState === 'rejected' && (
              <>Admin removed this match. Stats are no longer counted on any player&apos;s profile.</>
            )}
          </p>
        </div>
      </div>

      {/* Per-participant status list */}
      {participants.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1">
          {participants.map(p => {
            const isMe = p.player_id === currentUserId;
            const isScorer = p.player_id === scoredById;
            const statusColor =
              p.status === 'confirmed' ? 'text-emerald-400' :
              p.status === 'disputed'  ? 'text-red-400' :
                                         'text-amber-400';
            const StatusIcon =
              p.status === 'confirmed' ? CheckCircle2 :
              p.status === 'disputed'  ? AlertTriangle :
                                         null;
            return (
              <div key={p.player_id} className="flex items-center justify-between text-xs">
                <span className="text-gray-300 truncate">
                  {p.name}
                  {isMe && <span className="text-gray-600"> (you)</span>}
                  {isScorer && <span className="ml-1 text-[10px] text-emerald-500/70">scorer</span>}
                </span>
                <span className={`inline-flex items-center gap-1 ${statusColor} shrink-0`}>
                  {StatusIcon && <StatusIcon size={11} />}
                  {p.status === 'pending' ? 'Awaiting' : p.status[0].toUpperCase() + p.status.slice(1)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Action buttons for the current viewer */}
      {canRespond && disputeFor !== matchId && (
        <div className="flex gap-2 pt-2 border-t border-gray-800/60">
          <button
            onClick={() => respond('confirmed')}
            disabled={!!busyAction || isPending}
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold px-3 py-2 rounded-xl"
          >
            {busyAction === 'confirmed'
              ? <Loader2 size={14} className="animate-spin" />
              : <CheckCircle2 size={14} />}
            Confirm I played
          </button>
          <button
            onClick={() => setDisputeFor(matchId)}
            disabled={!!busyAction || isPending}
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-gray-800 hover:bg-red-950 hover:text-red-400 disabled:opacity-50 text-gray-300 text-sm font-semibold px-3 py-2 rounded-xl border border-gray-700"
          >
            <AlertTriangle size={14} />
            Dispute
          </button>
        </div>
      )}

      {/* Dispute reason form */}
      {canRespond && disputeFor === matchId && (
        <div className="flex flex-col gap-2 pt-2 border-t border-gray-800/60">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-red-400">Why are you disputing?</p>
            <button onClick={() => { setDisputeFor(null); setDisputeReason(''); }}
              className="text-gray-500 hover:text-white"><X size={14} /></button>
          </div>
          <textarea
            value={disputeReason}
            onChange={e => setDisputeReason(e.target.value)}
            placeholder="e.g. I wasn't in this match, score is wrong, didn't play this team…"
            rows={2}
            className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500 resize-none"
          />
          <button
            onClick={() => respond('disputed', disputeReason.trim() || undefined)}
            disabled={!!busyAction || isPending}
            className="inline-flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold px-3 py-2 rounded-xl"
          >
            {busyAction === 'disputed'
              ? <Loader2 size={14} className="animate-spin" />
              : <AlertTriangle size={14} />}
            Submit dispute
          </button>
        </div>
      )}

      {/* Scorer view when disputed — Force push button. The "Recheck" path
          is just the existing edit flow on this page. */}
      {viewerIsScorer && matchState === 'disputed' && (
        <div className="flex flex-col gap-2 pt-2 border-t border-gray-800/60">
          <p className="text-xs text-gray-400">
            You scored this match. Use the scorecard below to fix mistakes — each save that changes scores resets the dispute and asks participants again — or push to admin if you&apos;re sure.
          </p>
          <button
            onClick={forcePush}
            disabled={!!busyAction || isPending}
            className="inline-flex items-center justify-center gap-1.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold px-3 py-2 rounded-xl"
          >
            {busyAction === 'force_push'
              ? <Loader2 size={14} className="animate-spin" />
              : <ShieldAlert size={14} />}
            Force push to admin
          </button>
        </div>
      )}

      {/* Already responded message */}
      {me && myStatus !== 'pending' && (
        <p className="text-[11px] text-gray-500 italic pt-2 border-t border-gray-800/60">
          You {myStatus} this match.
          {myStatus === 'disputed' && ' Waiting for the scorer.'}
        </p>
      )}
    </div>
  );
}

