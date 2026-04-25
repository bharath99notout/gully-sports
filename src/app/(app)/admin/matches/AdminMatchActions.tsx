'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Loader2 } from 'lucide-react';
import { approveMatch, rejectMatch } from '@/app/actions/matchTrust';
import AdminDeleteMatchButton from '@/app/(app)/matches/[id]/AdminDeleteMatchButton';

/**
 * Approve / Reject buttons for a single row in the admin queue. Inline notes
 * input keeps the UI lightweight — no modal, no extra navigation.
 *
 * `allowFullDelete` — hide hard delete unless the match is completed (same rule as /matches/[id]).
 */
export default function AdminMatchActions({
  matchId,
  allowFullDelete = true,
}: {
  matchId: string;
  allowFullDelete?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');

  async function handle(action: 'approve' | 'reject') {
    if (action === 'reject' && !confirm('Reject this match? Stats will be removed for everyone.')) {
      return;
    }
    setBusy(action);
    const result = action === 'approve'
      ? await approveMatch(matchId, notes || undefined)
      : await rejectMatch(matchId, notes || undefined);
    setBusy(null);
    if (!result.ok) {
      alert(`${action} failed: ${result.error}`);
      return;
    }
    setNotes('');
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Optional admin note…"
        className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500"
      />
      <div className="flex gap-2">
        <button
          onClick={() => handle('approve')}
          disabled={!!busy}
          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg"
        >
          {busy === 'approve' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Approve
        </button>
        <button
          onClick={() => handle('reject')}
          disabled={!!busy}
          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg"
        >
          {busy === 'reject' ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
          Reject
        </button>
      </div>
      {allowFullDelete && (
        <div className="pt-2 border-t border-gray-800/60">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-500/90 mb-1.5">Admin · full delete</p>
          <div className="flex justify-end">
            <AdminDeleteMatchButton matchId={matchId} redirectAfter={false} compact />
          </div>
        </div>
      )}
    </div>
  );
}
