'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import { Match, MatchScore } from '@/types';

interface Props {
  match: Match;
  scoreA: MatchScore | null;
  scoreB: MatchScore | null;
  canEdit: boolean;
  allowDisputeRecheck?: boolean;
  adminOverrideCompleted?: boolean;
}

function GoalCard({
  score,
  canEdit,
  scoringActive,
}: {
  score: MatchScore;
  canEdit: boolean;
  scoringActive: boolean;
}) {
  const router = useRouter();
  const [goals, setGoals] = useState(score.goals ?? 0);
  const [saving, setSaving] = useState(false);

  async function updateGoals(newGoals: number) {
    setGoals(newGoals);
    setSaving(true);
    const supabase = createClient();
    await supabase.from('match_scores').update({ goals: newGoals }).eq('id', score.id);
    router.refresh();
    setSaving(false);
  }

  return (
    <Card padding="md" className="text-center">
      <h3 className="font-semibold text-white mb-3">{score.team_name}</h3>
      <div className="text-5xl font-bold text-white mb-4">{goals}</div>
      {canEdit && scoringActive && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => updateGoals(Math.max(0, goals - 1))}
            disabled={saving || goals === 0}
            className="w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-white text-xl transition-colors"
          >
            −
          </button>
          <button
            onClick={() => updateGoals(goals + 1)}
            disabled={saving}
            className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xl transition-colors"
          >
            +
          </button>
        </div>
      )}
    </Card>
  );
}

export default function FootballScorer({
  match,
  scoreA,
  scoreB,
  canEdit,
  allowDisputeRecheck = false,
  adminOverrideCompleted = false,
}: Props) {
  const isLive = match.status === 'live';
  const scoringActive =
    isLive
    || (match.status === 'completed' && (allowDisputeRecheck || adminOverrideCompleted));
  return (
    <div className="flex flex-col gap-3">
      {allowDisputeRecheck && (
        <p className="text-sm text-amber-200 bg-amber-950/35 border border-amber-800/50 rounded-xl px-3 py-2">
          <span className="font-semibold text-amber-300">Disputed — scorer recheck.</span>{' '}
          Adjust goals below; saving updates clears disputes and re-opens confirmations.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {scoreA && <GoalCard score={scoreA} canEdit={canEdit} scoringActive={scoringActive} />}
        {scoreB && <GoalCard score={scoreB} canEdit={canEdit} scoringActive={scoringActive} />}
      </div>
    </div>
  );
}
