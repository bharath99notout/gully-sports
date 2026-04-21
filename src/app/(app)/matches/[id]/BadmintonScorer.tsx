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
}

function SetScorer({
  score,
  canEdit,
  isLive,
  totalSets,
}: {
  score: MatchScore;
  canEdit: boolean;
  isLive: boolean;
  totalSets: number;
}) {
  const router = useRouter();
  const [sets, setSets] = useState<number[]>(score.sets ?? Array(totalSets).fill(0));
  const [saving, setSaving] = useState(false);

  async function updateSet(index: number, value: number) {
    const newSets = [...sets];
    newSets[index] = Math.max(0, value);
    setSets(newSets);
    setSaving(true);
    const supabase = createClient();
    await supabase.from('match_scores').update({ sets: newSets }).eq('id', score.id);
    router.refresh();
    setSaving(false);
  }

  return (
    <Card padding="md">
      <h3 className="font-semibold text-white mb-3">{score.team_name}</h3>
      <div className="flex gap-2 flex-wrap">
        {sets.map((pts, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <span className="text-xs text-gray-500">Set {i + 1}</span>
            <div className="text-2xl font-bold text-white">{pts}</div>
            {canEdit && isLive && (
              <div className="flex gap-1">
                <button
                  onClick={() => updateSet(i, pts - 1)}
                  disabled={saving || pts === 0}
                  className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-white text-xs"
                >
                  −
                </button>
                <button
                  onClick={() => updateSet(i, pts + 1)}
                  disabled={saving}
                  className="w-6 h-6 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs"
                >
                  +
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function BadmintonScorer({ match, scoreA, scoreB, canEdit }: Props) {
  const isLive = match.status === 'live';
  const totalSets = match.badminton_sets ?? 3;
  return (
    <div className="grid grid-cols-2 gap-3">
      {scoreA && <SetScorer score={scoreA} canEdit={canEdit} isLive={isLive} totalSets={totalSets} />}
      {scoreB && <SetScorer score={scoreB} canEdit={canEdit} isLive={isLive} totalSets={totalSets} />}
    </div>
  );
}
