'use client';

import { useEffect, useState } from 'react';
import type { MatchScore } from '@/types';

/**
 * Cross-component live-score broadcast for the match detail page.
 *
 * The page renders a `MatchHero` at the top and a sport-specific scorer
 * below. The scorer holds optimistic local state — when the user taps a
 * run / goal / point, only the scorer re-renders. The hero, being
 * server-rendered, is stuck at the page-load snapshot.
 *
 * This module gives the scorer a one-line way to broadcast its latest
 * (scoreA, scoreB), and the hero a hook to subscribe. We use a plain
 * window CustomEvent so no React Context wrapping is needed and the
 * page tree stays as-is.
 */

const EVENT_NAME = 'gs:match-score-update';

export type LiveScore = Pick<
  MatchScore,
  'runs' | 'wickets' | 'overs_faced' | 'goals' | 'sets'
> & Partial<MatchScore>;

type Detail = {
  matchId: string;
  scoreA: LiveScore | null;
  scoreB: LiveScore | null;
};

export function emitMatchScoreUpdate(
  matchId: string,
  scoreA: LiveScore | null,
  scoreB: LiveScore | null,
) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<Detail>(EVENT_NAME, { detail: { matchId, scoreA, scoreB } }),
  );
}

export function useLiveMatchScores(
  matchId: string,
  initialA: LiveScore | null,
  initialB: LiveScore | null,
): { scoreA: LiveScore | null; scoreB: LiveScore | null } {
  const [scores, setScores] = useState<{ scoreA: LiveScore | null; scoreB: LiveScore | null }>(
    { scoreA: initialA, scoreB: initialB },
  );

  useEffect(() => {
    function onUpdate(e: Event) {
      const detail = (e as CustomEvent<Detail>).detail;
      if (!detail || detail.matchId !== matchId) return;
      setScores({ scoreA: detail.scoreA, scoreB: detail.scoreB });
    }
    window.addEventListener(EVENT_NAME, onUpdate);
    return () => window.removeEventListener(EVENT_NAME, onUpdate);
  }, [matchId]);

  return scores;
}
