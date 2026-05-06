'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { createEvent, updateEvent } from '@/app/actions/events';
import type { SportEvent, SportType } from '@/types';

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

/** Convert a DB timestamptz back into the local-time string `<input type="datetime-local">` expects. */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Same form is used for create and edit. Pass `existing` to switch into
 * edit mode: the form pre-fills, the submit calls `updateEvent`, and the
 * sport picker is locked (changing sport on an existing event would
 * orphan its match data). Pass nothing for the create flow.
 */
export default function NewEventForm({ existing }: { existing?: SportEvent } = {}) {
  const router = useRouter();
  const isEdit = !!existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [sport, setSport] = useState<SportType>((existing?.sport as SportType) ?? 'cricket');
  const [startLocal, setStartLocal] = useState(
    existing ? isoToLocalInput(existing.start_at) : defaultStartLocal()
  );
  const [venueName, setVenueName] = useState(existing?.venue_name ?? '');
  const [capacity, setCapacity] = useState(existing?.capacity != null ? String(existing.capacity) : '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [recruiting, setRecruiting] = useState(existing?.recruiting ?? false);
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
    if (isEdit && existing) {
      const result = await updateEvent(existing.id, {
        name: name.trim(),
        start_at: startIso,
        venue_name: venueName.trim() || null,
        capacity: capacity ? Number(capacity) : null,
        description: description.trim() || null,
        recruiting,
      });
      setBusy(false);
      if (!result.ok) { setError(result.error); return; }
      router.push(`/events/${existing.id}`);
    } else {
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
        recruiting,
      });
      setBusy(false);
      if (!result.ok) { setError(result.error); return; }
      router.push(`/events/${result.data.id}`);
    }
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
              key={s.value} type="button"
              onClick={() => !isEdit && setSport(s.value)}
              disabled={isEdit}
              className={`flex flex-col items-center gap-1 rounded-xl py-3 border text-[11px] transition-colors ${
                sport === s.value
                  ? 'border-emerald-500 bg-emerald-900/20 text-emerald-300'
                  : 'border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800'
              } ${isEdit && sport !== s.value ? 'opacity-30' : ''} ${isEdit ? 'cursor-not-allowed' : ''}`}
            >
              <span className="text-xl">{s.emoji}</span>
              {s.label}
            </button>
          ))}
        </div>
        {isEdit && (
          <span className="text-[11px] text-gray-500">
            Sport is locked once an event has matches — changing it would orphan their stats.
          </span>
        )}
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

      <label className="flex items-start gap-3 bg-gray-900 border border-gray-800 rounded-xl px-3 py-3 cursor-pointer hover:border-orange-700/60 transition-colors">
        <input
          type="checkbox"
          checked={recruiting}
          onChange={e => setRecruiting(e.target.checked)}
          className="mt-0.5 accent-orange-500"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-white">🔥 Looking for players</span>
          <span className="text-[11px] text-gray-500">
            Surfaces this event in the &ldquo;Looking for players&rdquo; feed so others can join.
          </span>
        </span>
      </label>

      <div className="flex gap-2 pt-2">
        <Link
          href={isEdit && existing ? `/events/${existing.id}` : '/events'}
          className="flex-1 inline-flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-semibold px-3 py-2 rounded-xl"
        >
          Cancel
        </Link>
        <button
          type="submit" disabled={busy}
          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold px-3 py-2 rounded-xl"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          {isEdit ? 'Save changes' : 'Create event'}
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
