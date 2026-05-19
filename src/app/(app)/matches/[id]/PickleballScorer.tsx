'use client';

import { Match, MatchScore, MatchPlayer } from '@/types';
import BadmintonScorer from './BadmintonScorer';

interface Props {
  match: Match;
  scoreA: MatchScore | null;
  scoreB: MatchScore | null;
  canEdit: boolean;
  allowDisputeRecheck?: boolean;
  adminOverrideCompleted?: boolean;
  matchPlayers: MatchPlayer[];
}

/**
 * Pickleball uses the same set-based scoring mechanics as badminton/TT —
 * best-of-N games, each game to a target point count. We reuse
 * BadmintonScorer by normalising the match to expose its sport-specific
 * fields via the badminton_* props the scorer already understands.
 */
export default function PickleballScorer(props: Props) {
  const shimmedMatch: Match = {
    ...props.match,
    badminton_sets:          props.match.pickleball_sets          ?? 3,
    badminton_target_points: props.match.pickleball_target_points ?? 21,
  };
  return <BadmintonScorer {...props} match={shimmedMatch} />;
}
