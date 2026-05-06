'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';

/**
 * Guest RSVP — for plus-ones who got the WhatsApp link but don't have an
 * account. Posts to /api/events/[id]/rsvp-guest which validates + writes
 * via service role. The phone is the future link key: when they later
 * sign up via last4-OTP, their event_rsvps rows get player_id backfilled.
 */
export default function GuestRsvpForm({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(status: 'going' | 'maybe') {
    setError(null); setSuccess(null);
    if (!name.trim()) { setError('Enter your name'); return; }
    const phone10 = phone.replace(/\D/g, '').slice(-10);
    if (phone10.length !== 10) { setError('Phone must be 10 digits'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${eventId}/rsvp-guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone10, status }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
      if (!res.ok) { setError(body.error ?? `HTTP ${res.status}`); return; }
      setSuccess(
        body.status === 'waitlist'
          ? `Got it — you're on the waitlist (event is full).`
          : `Got it — see you there!`
      );
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-white">RSVP without signing up</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Just your name + phone. Claim your stats later by signing in with the same number.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} maxLength={80}
          className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-700"
        />
        <input
          type="tel" placeholder="10-digit phone" value={phone} onChange={e => setPhone(e.target.value)}
          inputMode="numeric" maxLength={15}
          className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-700"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button" onClick={() => submit('going')} disabled={busy || isPending}
          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold px-3 py-2 rounded-xl"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          I&apos;m going
        </button>
        <button
          type="button" onClick={() => submit('maybe')} disabled={busy || isPending}
          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 text-sm font-semibold px-3 py-2 rounded-xl border border-gray-700"
        >
          Maybe
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-emerald-400">{success}</p>}
    </section>
  );
}
