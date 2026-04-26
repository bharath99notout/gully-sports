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
 * Table Tennis uses the same set-based scoring mechanics as badminton.
 * We reuse BadmintonScorer by normalising the match to expose its sport-specific
 * set/target fields via the badminton_* props the scorer already understands.
 */
export default function TableTennisScorer(props: Props) {
  const shimmedMatch: Match = {
    ...props.match,
    badminton_sets:          props.match.tt_sets          ?? 5,
    badminton_target_points: props.match.tt_target_points ?? 11,
  };
  return <BadmintonScorer {...props} match={shimmedMatch} />;
}
