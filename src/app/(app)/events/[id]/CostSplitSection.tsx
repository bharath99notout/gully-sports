'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { IndianRupee, Loader2, Wallet, Share2, Smartphone, RefreshCw } from 'lucide-react';
import { saveEventCost, setAssignmentPaid, recomputeEventCost } from '@/app/actions/events';

interface AssignmentView {
  id: string;
  player_id: string;
  player_name: string;
  amount_paise: number;
  paid: boolean;
}

interface Props {
  eventId: string;
  eventName: string;
  isHost: boolean;
  currentUserId: string | null;
  cost: {
    total_amount_paise: number;
    notes: string | null;
  } | null;
  assignments: AssignmentView[];
  /** Host's saved UPI VPA. When present, players see a "Pay via UPI" button. */
  hostUpiVpa: string | null;
  /** Host's display name — used in the UPI deeplink's payee-name (`pn`) param. */
  hostName: string | null;
}

function formatRupees(paise: number): string {
  const rupees = Math.abs(paise) / 100;
  const sign = paise < 0 ? '-' : '';
  return `${sign}₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * UPI deeplink. Opens any installed UPI app (GPay / PhonePe / Paytm /
 * BHIM / etc.) pre-filled with the host's VPA, the exact amount, and a
 * note. Spec: https://www.npci.org.in/PDF/npci/upi/circular/2017/UPI-Linking-Specs.pdf
 *
 * `am` is decimal rupees (not paise); `cu` must be INR; `tn` is a free-text
 * transaction note shown to the payer in their UPI app.
 */
function buildUpiDeeplink(opts: { vpa: string; payeeName: string; amountPaise: number; note: string }): string {
  const params = new URLSearchParams({
    pa: opts.vpa,
    pn: opts.payeeName,
    am: (opts.amountPaise / 100).toFixed(2),
    cu: 'INR',
    tn: opts.note,
  });
  return `upi://pay?${params.toString()}`;
}

export default function CostSplitSection({
  eventId, eventName, isHost, currentUserId, cost, assignments, hostUpiVpa, hostName,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [editing, setEditing] = useState(!cost && isHost);
  const [totalRupees, setTotalRupees] = useState<string>(
    cost ? (cost.total_amount_paise / 100).toString() : ''
  );
  const [notes, setNotes] = useState<string>(cost?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const total = Math.round(Number(totalRupees) * 100);
    if (!Number.isFinite(total) || total < 0) {
      setError('Enter a valid amount in rupees'); return;
    }
    setSaving(true);
    const result = await saveEventCost(eventId, {
      total_amount_paise: total,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    setEditing(false);
    startTransition(() => router.refresh());
  }

  async function togglePaid(assignmentId: string, paid: boolean) {
    const result = await setAssignmentPaid(assignmentId, paid);
    if (!result.ok) { alert(result.error); return; }
    startTransition(() => router.refresh());
  }

  const [recomputing, setRecomputing] = useState(false);
  async function recompute() {
    setRecomputing(true);
    const result = await recomputeEventCost(eventId);
    setRecomputing(false);
    if (!result.ok) { alert(result.error); return; }
    startTransition(() => router.refresh());
  }

  /** Build the multi-line WhatsApp message the host can blast to the group. */
  function shareSplitToWhatsApp() {
    if (!cost || assignments.length === 0) return;
    const lines: string[] = [];
    lines.push(`💰 ${eventName} — split`);
    lines.push(`Total: ${formatRupees(cost.total_amount_paise)}${cost.notes ? ` (${cost.notes})` : ''}`);
    lines.push('');
    for (const a of assignments) {
      const flag = a.paid ? ' ✅' : '';
      lines.push(`• ${a.player_name} — ${formatRupees(a.amount_paise)}${flag}`);
    }
    if (hostUpiVpa) {
      lines.push('');
      lines.push(`Pay to: ${hostUpiVpa}`);
      if (hostName) lines.push(`(${hostName})`);
    }
    const wa = `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(wa, '_blank', 'noopener,noreferrer');
  }

  // Player view
  if (!isHost) {
    if (!cost && assignments.length === 0) return null;
    const myAssignment = assignments.find(a => a.player_id === currentUserId);
    return (
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Wallet size={16} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-white">Cost split</h2>
        </div>
        {cost && (
          <p className="text-xs text-gray-400">
            Total: <span className="text-white font-semibold">{formatRupees(cost.total_amount_paise)}</span>
            <span className="text-gray-600"> · split among players who played</span>
          </p>
        )}
        {myAssignment ? (
          <div className={`rounded-xl border px-3 py-3 flex flex-col gap-2 ${
            myAssignment.paid
              ? 'border-emerald-900/60 bg-emerald-950/30'
              : 'border-amber-800/60 bg-amber-950/30'
          }`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Your share</p>
                <p className={`text-lg font-bold ${myAssignment.paid ? 'text-emerald-300' : 'text-amber-200'}`}>
                  {formatRupees(myAssignment.amount_paise)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => togglePaid(myAssignment.id, !myAssignment.paid)}
                disabled={isPending}
                className={`text-xs font-semibold px-3 py-2 rounded-lg ${
                  myAssignment.paid
                    ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700'
                }`}
              >
                {myAssignment.paid ? 'Paid ✓' : 'Mark paid'}
              </button>
            </div>
            {hostUpiVpa && !myAssignment.paid && (
              <a
                href={buildUpiDeeplink({
                  vpa: hostUpiVpa,
                  payeeName: hostName ?? 'Host',
                  amountPaise: myAssignment.amount_paise,
                  note: `${eventName} share`,
                })}
                className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-3 py-2.5 rounded-xl"
              >
                <Smartphone size={14} /> Pay {formatRupees(myAssignment.amount_paise)} via UPI
              </a>
            )}
            {hostUpiVpa && (
              <p className="text-[10px] text-gray-500 font-mono text-center">to {hostUpiVpa}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500">You don&apos;t have a share yet — looks like you didn&apos;t play in any match here.</p>
        )}
        {assignments.length > 0 && (
          <details className="text-xs">
            <summary className="text-gray-500 cursor-pointer hover:text-gray-300">All splits ({assignments.length})</summary>
            <ul className="mt-2 flex flex-col gap-1.5">
              {assignments.map(a => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span className={a.player_id === currentUserId ? 'text-white' : 'text-gray-400'}>
                    {a.player_name}
                  </span>
                  <span className={a.paid ? 'text-emerald-400' : 'text-amber-300'}>
                    {formatRupees(a.amount_paise)}{a.paid ? ' ✓' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    );
  }

  // Host view
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet size={16} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-white">Cost split</h2>
        </div>
        <div className="flex items-center gap-3">
          {!editing && cost && (
            <button
              type="button"
              onClick={recompute}
              disabled={recomputing}
              className="text-xs text-gray-400 hover:text-white inline-flex items-center gap-1"
              title="Recompute splits against the current match-players list"
            >
              {recomputing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              Recompute
            </button>
          )}
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              {cost ? 'Edit' : 'Set up'}
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Total cost (₹)</span>
            <div className="relative">
              <IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                type="number" min="0" step="1" inputMode="numeric"
                value={totalRupees} onChange={e => setTotalRupees(e.target.value)}
                placeholder="e.g. 1200"
                className="w-full bg-gray-950 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-700"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Notes (optional)</span>
            <input
              type="text" value={notes} onChange={e => setNotes(e.target.value)} maxLength={200}
              placeholder="Court 900 + balls 200 + water 100"
              className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-700"
            />
          </label>

          <p className="text-[11px] text-gray-500 leading-snug">
            Share splits equally among everyone who appears as a player in any match scored under this event.
            Score the matches first, then save here to compute shares.
          </p>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button" onClick={() => setEditing(false)} disabled={saving}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-semibold px-3 py-2 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="button" onClick={save} disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold px-3 py-2 rounded-xl"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Save & recompute
            </button>
          </div>
        </div>
      ) : cost ? (
        <>
          <div className="flex items-center justify-between gap-3 bg-gray-800/40 rounded-xl px-3 py-2.5">
            <div>
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Total</p>
              <p className="text-lg font-bold text-white">{formatRupees(cost.total_amount_paise)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-gray-500">Split among players who played</p>
              {cost.notes && <p className="text-[11px] text-gray-400 mt-0.5">{cost.notes}</p>}
            </div>
          </div>
          {assignments.length === 0 ? (
            <p className="text-xs text-gray-500 italic">
              No matches scored yet. Score at least one match below, then re-save here to compute shares.
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-1">
                {assignments.map(a => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-gray-800/40 last:border-0">
                    <span className="text-gray-300 truncate">{a.player_name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`tabular-nums ${a.paid ? 'text-emerald-400' : 'text-amber-300'}`}>
                        {formatRupees(a.amount_paise)}
                      </span>
                      <button
                        type="button"
                        onClick={() => togglePaid(a.id, !a.paid)}
                        className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
                          a.paid
                            ? 'bg-emerald-900/50 text-emerald-300 hover:bg-emerald-900'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                      >
                        {a.paid ? 'Paid ✓' : 'Mark paid'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Host actions: blast the entire split to a WhatsApp group in one message */}
              <div className="flex flex-col gap-2 pt-2 border-t border-gray-800/40">
                <button
                  type="button"
                  onClick={shareSplitToWhatsApp}
                  className="inline-flex items-center justify-center gap-1.5 bg-emerald-700/30 hover:bg-emerald-700/50 text-emerald-200 text-sm font-semibold px-3 py-2 rounded-xl border border-emerald-800/60"
                >
                  <Share2 size={14} /> Share split to WhatsApp
                </button>
                {hostUpiVpa ? (
                  <p className="text-[11px] text-gray-500 text-center">
                    Pay-to: <span className="font-mono text-gray-300">{hostUpiVpa}</span> · message includes a tap-to-pay UPI for everyone
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-300/80 text-center">
                    Add a UPI ID on{' '}
                    <a href="/profile" className="underline hover:text-amber-200">your profile</a>
                    {' '}so players can pay you in one tap.
                  </p>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <p className="text-xs text-gray-500 italic">
          No cost set up yet. Score the matches first, then tap &quot;Set up&quot; to enter the total — we&apos;ll split it evenly among everyone who played.
        </p>
      )}
    </section>
  );
}
