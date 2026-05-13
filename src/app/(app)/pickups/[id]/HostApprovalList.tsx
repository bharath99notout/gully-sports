'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Check, X } from 'lucide-react';
import { decideResponse, markAttendance } from '@/app/actions/pickups';
import type { PickupResponse } from '@/types';
import { buildPickupWaContextLine } from '@/lib/pickupShareText';

type ResponseWithJoiner = PickupResponse & {
  joiner: { id: string; name: string; avatar_url: string | null; phone: string | null };
};

export default function HostApprovalList({
  pending, accepted, allResponses, requestId, slotsTotal, startTimeIso,
  sportLabel,
  groundName,
  mutualByJoinerId = {},
}: {
  pending: ResponseWithJoiner[];
  accepted: ResponseWithJoiner[];
  /** Responses already marked showed_up / no_show — read-only display. */
  allResponses?: ResponseWithJoiner[];
  requestId: string;
  slotsTotal: number;
  /** Used to decide whether to show the attendance buttons. */
  startTimeIso: string;
  sportLabel: string;
  groundName: string;
  /** Host's mutual match count with each joiner (for quick trust signal). */
  mutualByJoinerId?: Record<string, number>;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const slotsLeft = Math.max(0, slotsTotal - accepted.length);

  const matchStarted = new Date(startTimeIso).getTime() <= Date.now();
  const finalised = allResponses?.filter(r =>
    r.status === 'showed_up' || r.status === 'no_show',
  ) ?? [];

  async function decide(id: string, decision: 'accepted' | 'declined') {
    setBusyId(id);
    await decideResponse(id, decision);
    setBusyId(null);
    router.refresh();
  }

  async function attend(id: string, attended: boolean) {
    setBusyId(id);
    await markAttendance(id, attended);
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">
          Joiners
        </h2>
        <span className="text-[11px] text-gray-500">{slotsLeft} slot{slotsLeft === 1 ? '' : 's'} left</span>
      </div>

      {accepted.length === 0 && pending.length === 0 && (
        <div className="px-4 py-6 text-center text-sm text-gray-500">
          Waiting for joiners… your ping is visible to nearby players.
          <p className="mt-1 text-xs text-gray-600">Pickup #{requestId.slice(0, 8)}</p>
        </div>
      )}

      {accepted.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-800">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-2">
            Accepted ({accepted.length})
          </p>
          <div className="flex flex-col gap-2">
            {accepted.map(r => {
              const busy = busyId === r.id;
              const mutual = mutualByJoinerId[r.joiner_id] ?? 0;
              const digits = r.joiner.phone?.replace(/\D/g, '').slice(-10) ?? '';
              const waHref =
                digits.length === 10
                  ? `https://wa.me/91${digits}?text=${encodeURIComponent(
                      buildPickupWaContextLine({
                        sportLabel,
                        groundName,
                        startIso: startTimeIso,
                        role: 'host',
                        counterpartName: r.joiner.name,
                      }),
                    )}`
                  : null;
              return (
                <div key={r.id} className="flex items-start gap-2.5 text-sm">
                  <JoinerAvatar id={r.joiner.id} name={r.joiner.name} url={r.joiner.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/players/${r.joiner.id}`}
                      className="text-white font-medium truncate hover:text-emerald-300 hover:underline block"
                    >
                      {r.joiner.name}
                    </Link>
                    {mutual > 0 && (
                      <p className="text-[10px] text-emerald-500/90 mt-0.5">
                        {mutual} mutual match{mutual === 1 ? '' : 'es'}
                      </p>
                    )}
                    <Link href={`/players/${r.joiner.id}`} className="text-[10px] text-emerald-400 hover:underline">
                      Profile & stats →
                    </Link>
                  </div>
                  {waHref ? (
                    <a
                      href={waHref}
                      target="_blank" rel="noreferrer"
                      className="text-[11px] text-emerald-400 hover:underline shrink-0"
                    >
                      WhatsApp
                    </a>
                  ) : null}
                  {matchStarted && (
                    <>
                      <button
                        onClick={() => attend(r.id, true)}
                        disabled={busy}
                        title="Showed up"
                        className="px-2 py-1 rounded-lg bg-emerald-900/40 hover:bg-emerald-900/70 border border-emerald-800 text-emerald-300 text-[10px] font-bold disabled:opacity-40 shrink-0"
                      >
                        {busy ? <Loader2 size={10} className="animate-spin" /> : '✓ Came'}
                      </button>
                      <button
                        onClick={() => attend(r.id, false)}
                        disabled={busy}
                        title="No-show"
                        className="px-2 py-1 rounded-lg bg-red-900/40 hover:bg-red-900/70 border border-red-800 text-red-300 text-[10px] font-bold disabled:opacity-40 shrink-0"
                      >
                        No-show
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {finalised.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-800">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
            After match ({finalised.length})
          </p>
          <div className="flex flex-col gap-1.5">
            {finalised.map(r => (
              <div key={r.id} className="flex items-start gap-2.5 text-sm">
                <JoinerAvatar id={r.joiner.id} name={r.joiner.name} url={r.joiner.avatar_url} />
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/players/${r.joiner.id}`}
                    className="text-gray-200 font-medium truncate hover:text-emerald-300 hover:underline block"
                  >
                    {r.joiner.name}
                  </Link>
                </div>
                <span className={`text-[10px] font-bold uppercase shrink-0 ${
                  r.status === 'showed_up' ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {r.status === 'showed_up' ? 'Showed up' : 'No-show'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-2">
            Requesting to join ({pending.length})
          </p>
          <div className="flex flex-col gap-3">
            {pending.map(r => {
              const busy = busyId === r.id;
              const slotsFull = slotsLeft <= 0;
              const mutual = mutualByJoinerId[r.joiner_id] ?? 0;
              return (
                <div key={r.id} className="rounded-xl border border-gray-800/80 bg-gray-950/40 p-3">
                  <div className="flex items-start gap-2.5">
                    <JoinerAvatar id={r.joiner.id} name={r.joiner.name} url={r.joiner.avatar_url} />
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/players/${r.joiner.id}`}
                        className="text-sm text-white font-semibold truncate hover:text-emerald-300 hover:underline block"
                      >
                        {r.joiner.name}
                      </Link>
                      {mutual > 0 ? (
                        <p className="text-[11px] text-emerald-400 mt-0.5">
                          {mutual} mutual match{mutual === 1 ? '' : 'es'} with you
                        </p>
                      ) : (
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Tap profile to see caliber & recent games
                        </p>
                      )}
                      <Link href={`/players/${r.joiner.id}`} className="inline-block mt-1 text-xs text-emerald-400 font-semibold hover:underline">
                        View full profile →
                      </Link>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        onClick={() => decide(r.id, 'accepted')}
                        disabled={busy || slotsFull}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold disabled:opacity-40 flex items-center justify-center gap-1"
                        title={slotsFull ? 'No slots left' : 'Accept'}
                      >
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                        Accept
                      </button>
                      <button
                        onClick={() => decide(r.id, 'declined')}
                        disabled={busy}
                        className="px-2 py-1.5 rounded-lg border border-gray-700 hover:bg-gray-800 text-gray-300 text-xs disabled:opacity-40 flex items-center justify-center gap-1"
                      >
                        <X size={11} />
                        Decline
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function JoinerAvatar({ id, name, url }: { id: string; name: string; url: string | null }) {
  const inner = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name} className="w-9 h-9 rounded-full object-cover bg-gray-800 shrink-0" />
  ) : (
    <div className="w-9 h-9 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
      {name[0]?.toUpperCase() ?? '?'}
    </div>
  );
  return (
    <Link href={`/players/${id}`} className="shrink-0 rounded-full ring-1 ring-transparent hover:ring-emerald-600/50">
      {inner}
    </Link>
  );
}
