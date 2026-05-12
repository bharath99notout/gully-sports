'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  cancelPickup, requestToJoin, withdrawResponse,
} from '@/app/actions/pickups';
import type { PickupRequestWithMeta, PickupResponse } from '@/types';

interface Props {
  pickup: PickupRequestWithMeta;
  isHost: boolean;
  myResponse: PickupResponse | null;
}

export default function PickupActions({ pickup, isHost, myResponse }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = pickup.status === 'open';

  async function doCancel() {
    if (!confirm('Cancel this pickup? Joiners who accepted will be notified.')) return;
    setBusy(true);
    setError(null);
    const r = await cancelPickup(pickup.id);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    router.refresh();
  }

  async function doJoin() {
    setBusy(true);
    setError(null);
    const r = await requestToJoin(pickup.id);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    router.refresh();
  }

  async function doWithdraw() {
    setBusy(true);
    setError(null);
    const r = await withdrawResponse(pickup.id);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    router.refresh();
  }

  // ── Host view ──
  if (isHost) {
    if (!isOpen) return null;
    return (
      <button
        onClick={doCancel}
        disabled={busy}
        className="w-full py-2.5 rounded-xl border border-red-800/60 bg-red-950/20 hover:bg-red-950/40 text-red-300 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : null}
        Cancel pickup
      </button>
    );
  }

  // ── Joiner view ──
  if (!isOpen) {
    return (
      <p className="text-xs text-gray-500 text-center">
        This pickup is {pickup.status} — no longer accepting joiners.
      </p>
    );
  }

  if (myResponse?.status === 'accepted') {
    return (
      <p className="text-center text-sm text-emerald-400 font-semibold">
        ✓ You&apos;re in. Coordinate with the host on WhatsApp above.
      </p>
    );
  }

  if (myResponse?.status === 'requested') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-center text-xs text-amber-300">Waiting for host to confirm…</p>
        <button
          onClick={doWithdraw}
          disabled={busy}
          className="w-full py-2 rounded-xl border border-gray-800 bg-gray-900 hover:bg-gray-800 text-gray-300 text-sm disabled:opacity-50"
        >
          Withdraw
        </button>
        {error && <p className="text-xs text-red-400 text-center">{error}</p>}
      </div>
    );
  }

  if (myResponse?.status === 'declined') {
    return (
      <p className="text-center text-xs text-gray-500">
        Host already filled this slot.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={doJoin}
        disabled={busy}
        className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : null}
        I&apos;m in — request to join
      </button>
      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
    </div>
  );
}
