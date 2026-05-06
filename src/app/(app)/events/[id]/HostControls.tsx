'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Ban, Trash2, Loader2 } from 'lucide-react';
import { cancelEvent, deleteEvent } from '@/app/actions/events';

/**
 * Host-only controls on the event detail page: Edit / Cancel / Delete.
 *
 *   Edit  — link to /events/[id]/edit; reuses NewEventForm in edit mode.
 *   Cancel — soft. Status flips to 'cancelled' but the event row + RSVPs
 *            stay so people see why their plan disappeared. Optional reason.
 *   Delete — hard. Cascade-deletes RSVPs / costs / invites. Use only for
 *            spam / accidental creations / test events.
 *
 * "Cancel" and "Delete" are confirmed inline (small panel reveal) rather
 * than via window.confirm — confirm is easy to misclick on mobile.
 */
export default function HostControls({
  eventId,
  eventName,
  status,
}: {
  eventId: string;
  eventName: string;
  status: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [busy, setBusy] = useState<'cancel' | 'delete' | null>(null);
  const [openPanel, setOpenPanel] = useState<'cancel' | 'delete' | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isCancelled = status === 'cancelled';

  async function doCancel() {
    setError(null);
    setBusy('cancel');
    const result = await cancelEvent(eventId, reason);
    setBusy(null);
    if (!result.ok) { setError(result.error); return; }
    setOpenPanel(null);
    setReason('');
    startTransition(() => router.refresh());
  }

  async function doDelete() {
    setError(null);
    setBusy('delete');
    const result = await deleteEvent(eventId);
    setBusy(null);
    if (!result.ok) { setError(result.error); return; }
    // Event no longer exists — bounce to the list. We don't router.refresh()
    // because the current page is now a 404.
    router.push('/events');
  }

  return (
    <section className="rounded-2xl border border-amber-800/60 bg-amber-950/20 px-3 py-3 flex flex-col gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-400">Host tools</p>
        <p className="text-[11px] text-gray-500 mt-0.5">
          Edit the details, cancel to keep the audit trail, or delete for accidental / test events (cascade — RSVPs and cost split go too).
        </p>
      </div>

      <div className="flex flex-wrap gap-2 justify-end">
        <Link
          href={`/events/${eventId}/edit`}
          className="inline-flex items-center gap-1.5 bg-emerald-950/50 hover:bg-emerald-900/40 text-emerald-300 border border-emerald-800/60 text-sm font-semibold px-3 py-2 rounded-xl"
        >
          <Pencil size={13} /> Edit
        </Link>

        {!isCancelled && (
          <button
            type="button"
            onClick={() => { setOpenPanel(openPanel === 'cancel' ? null : 'cancel'); setError(null); }}
            disabled={!!busy || isPending}
            className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-amber-950/40 text-gray-300 hover:text-amber-300 border border-gray-800 hover:border-amber-800/60 text-sm font-semibold px-3 py-2 rounded-xl"
          >
            <Ban size={13} /> Cancel
          </button>
        )}

        <button
          type="button"
          onClick={() => { setOpenPanel(openPanel === 'delete' ? null : 'delete'); setError(null); }}
          disabled={!!busy || isPending}
          className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-red-950/40 text-gray-300 hover:text-red-300 border border-gray-800 hover:border-red-900/60 text-sm font-semibold px-3 py-2 rounded-xl"
        >
          <Trash2 size={13} /> Delete
        </button>
      </div>

      {/* Cancel-confirm panel */}
      {openPanel === 'cancel' && (
        <div className="bg-amber-950/30 border border-amber-900/50 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-xs text-amber-200">
            Cancelling marks the event as cancelled. RSVPs see the reason. Stats from any matches scored under this event are kept.
          </p>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Reason (optional, shown to RSVPs)"
            maxLength={200}
            className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button" onClick={() => setOpenPanel(null)} disabled={busy === 'cancel'}
              className="text-xs text-gray-400 hover:text-white px-3 py-1.5"
            >
              Back
            </button>
            <button
              type="button" onClick={doCancel} disabled={busy === 'cancel'}
              className="inline-flex items-center gap-1.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
            >
              {busy === 'cancel' ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />}
              Confirm cancel
            </button>
          </div>
        </div>
      )}

      {/* Delete-confirm panel */}
      {openPanel === 'delete' && (
        <div className="bg-red-950/40 border border-red-900/60 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-xs text-red-200">
            <strong>Delete &quot;{eventName}&quot; permanently?</strong>
            <br />
            All RSVPs, cost-split data, and invites for this event will be removed.
            Match scorecards stay (they live independently). This cannot be undone.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button" onClick={() => setOpenPanel(null)} disabled={busy === 'delete'}
              className="text-xs text-gray-400 hover:text-white px-3 py-1.5"
            >
              Back
            </button>
            <button
              type="button" onClick={doDelete} disabled={busy === 'delete'}
              className="inline-flex items-center gap-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
            >
              {busy === 'delete' ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              Delete forever
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-300">{error}</p>}
    </section>
  );
}
