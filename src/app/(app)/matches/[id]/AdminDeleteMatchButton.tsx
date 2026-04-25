'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';
import { deleteMatchAsAdmin } from '@/app/actions/matchTrust';

interface Props {
  matchId: string;
  /** When true, navigate to /matches after successful delete (detail page is gone). */
  redirectAfter?: boolean;
  compact?: boolean;
}

/**
 * Destructive delete — `deleteMatchAsAdmin` re-checks `profiles.is_admin` on submit.
 * Parents should only mount when the server has verified admin and the match
 * is `completed` — `deleteMatchAsAdmin` also rejects non-completed matches.
 */
export default function AdminDeleteMatchButton({ matchId, redirectAfter = true, compact }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!confirm('Permanently delete this match? All scores, player stats, and confirmations for this match will be removed. This cannot be undone.')) {
      return;
    }
    setBusy(true);
    const res = await deleteMatchAsAdmin(matchId);
    setBusy(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    if (redirectAfter) {
      router.replace('/matches?deleted=1');
      router.refresh();
    } else {
      router.replace('/admin/matches?deleted=1');
      startTransition(() => router.refresh());
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors disabled:opacity-50 ${
        compact
          ? 'text-xs px-2.5 py-1.5 bg-red-950/50 text-red-400 border border-red-900/60 hover:bg-red-900/40'
          : 'text-sm px-3 py-2 bg-red-600 hover:bg-red-500 text-white'
      }`}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
      Delete match
    </button>
  );
}
