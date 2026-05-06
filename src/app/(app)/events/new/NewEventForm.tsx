'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { createEvent } from '@/app/actions/events';
import type { SportType } from '@/types';

const SPORTS: { value: SportType; label: string; emoji: string }[] = [
  { value: 'cricket',      label: 'Cricket',      emoji: '🏏' },
  { value: 'football',     label: 'Football',     emoji: '⚽' },
  { value: 'badminton',    label: 'Badminton',    emoji: '🏸' },
  { value: 'table_tennis', label: 'Table Tennis', emoji: '🏓' },
];

function defaultStartLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(7, 0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NewEventForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sport, setSport] = useState<SportType>('cricket');
  const [startLocal, setStartLocal] = useState(defaultStartLocal());
  const [venueName, setVenueName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('Event name is required'); return; }
    if (!startLocal) { setError('Start time is required'); return; }

    // datetime-local input gives "YYYY-MM-DDTHH:MM" interpreted as the
    // user's wall-clock time. `new Date(localStr)` parses that as the
    // browser's local timezone, then toISOString() converts to UTC. This
    // is what we want stored — the Postgres timestamptz column then renders
    // back to the user's local zone via `toLocaleString` on the detail page.
    let startIso: string;
    try {
      startIso = new Date(startLocal).toISOString();
    } catch {
      setError('Invalid start time'); return;
    }

    setBusy(true);
    const result = await createEvent({
      name: name.trim(),
      sport,
      start_at: startIso,
      venue_name: venueName.trim() || null,
      capacity: capacity ? Number(capacity) : null,
      description: description.trim() || null,
      // invite_only is removed from the UI — anyone with the link can RSVP
      // (the host_id check on the server keeps writes locked down).
      invite_only: false,
    });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    router.push(`/events/${result.data.id}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && (
        <div className="bg-red-950/40 border border-red-900/60 rounded-xl px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <Field label="Event name" required>
        <input
          type="text" value={name} onChange={e => setName(e.target.value)}
          required maxLength={120}
          placeholder="Friday Badminton"
          className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-700"
        />
      </Field>

      <Field label="Sport" required>
        <div className="grid grid-cols-4 gap-2">
          {SPORTS.map(s => (
            <button
              key={s.value} type="button" onClick={() => setSport(s.value)}
              className={`flex flex-col items-center gap-1 rounded-xl py-3 border text-[11px] transition-colors ${
                sport === s.value
                  ? 'border-emerald-500 bg-emerald-900/20 text-emerald-300'
                  : 'border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span className="text-xl">{s.emoji}</span>
              {s.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Start time" required>
        <input
          type="datetime-local" value={startLocal}
          onChange={e => setStartLocal(e.target.value)} required
          className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-700"
        />
      </Field>

      <Field label="Venue (where to meet)">
        <input
          type="text" value={venueName} onChange={e => setVenueName(e.target.value)}
          maxLength={200}
          placeholder="Sarjapur — Decathlon courts"
          className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-700"
        />
        <span className="text-[11px] text-gray-500">
          We&apos;ll auto-link this to Google Maps on the event page.
        </span>
      </Field>

      <Field label="Capacity (max players)">
        <input
          type="number" min={1} max={200}
          value={capacity} onChange={e => setCapacity(e.target.value)}
          placeholder="e.g. 12"
          className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-700"
        />
      </Field>

      <Field label="Notes for players">
        <textarea
          rows={3} maxLength={1000}
          value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Bring water. Cost split after the game."
          className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-700 resize-none"
        />
      </Field>

      <div className="flex gap-2 pt-2">
        <Link
          href="/events"
          className="flex-1 inline-flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-semibold px-3 py-2 rounded-xl"
        >
          Cancel
        </Link>
        <button
          type="submit" disabled={busy}
          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold px-3 py-2 rounded-xl"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          Create event
        </button>
      </div>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-gray-300">
        {label}{required && <span className="text-emerald-400 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
