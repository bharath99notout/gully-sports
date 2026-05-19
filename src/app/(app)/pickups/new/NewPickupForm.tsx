'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, MapPin, AlertCircle } from 'lucide-react';
import { createPickup } from '@/app/actions/pickups';
import { useGeolocation } from '@/lib/useGeolocation';
import SportIcon from '@/components/SportIcon';
import type { SportType } from '@/types';
import { SPORTS_LIST } from '@/lib/sports';

const SPORTS = SPORTS_LIST;

const START_PRESETS = [
  { label: 'Now',     mins: 0   },
  { label: '+30 min', mins: 30  },
  { label: '+1 hr',   mins: 60  },
  { label: '+2 hr',   mins: 120 },
] as const;

const MAX_SCHEDULE_DAYS = 60;

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** Value for `<input type="datetime-local" />` in the user's local timezone. */
function toLocalDatetimeValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function localDatetimeToIso(local: string): string | null {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function maxScheduleLocalValue(): string {
  return toLocalDatetimeValue(new Date(new Date().getTime() + MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000));
}

function localDatetimeFromNow(offsetMs: number): string {
  return toLocalDatetimeValue(new Date(new Date().getTime() + offsetMs));
}

export default function NewPickupForm() {
  const router = useRouter();
  const geo = useGeolocation();

  const [sport, setSport] = useState<SportType>('cricket');
  const [groundName, setGroundName] = useState('');
  const [slots, setSlots] = useState('1');
  const [format, setFormat] = useState('');
  const [notes, setNotes] = useState('');
  const [startLocal, setStartLocal] = useState(() => toLocalDatetimeValue(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFix = geo.fix != null;

  const [tryAgain, setTryAgain] = useState(0);
  useEffect(() => {
    if (tryAgain > 0) geo.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tryAgain]);

  function applyPresetMins(mins: number) {
    setStartLocal(localDatetimeFromNow(mins * 60 * 1000));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!groundName.trim()) { setError('Ground name is required'); return; }
    if (!geo.fix) {
      setError('Allow location access — pickups are matched by distance.');
      return;
    }
    const slotsNum = parseInt(slots, 10);
    if (!Number.isFinite(slotsNum) || slotsNum < 1 || slotsNum > 15) {
      setError('Slots must be 1–15'); return;
    }

    const startIso = localDatetimeToIso(startLocal);
    if (!startIso) {
      setError('Pick a valid date and time'); return;
    }

    setBusy(true);
    const result = await createPickup({
      sport,
      ground_name: groundName.trim(),
      ground_lat:  geo.fix.lat,
      ground_lng:  geo.fix.lng,
      slots_total: slotsNum,
      format: format.trim() || undefined,
      notes: notes.trim() || undefined,
      start_time: startIso,
    });
    setBusy(false);

    if (!result.ok) { setError(result.error); return; }
    router.push(`/pickups/${result.data.id}`);
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Need Players Now</h1>
        <Link href="/pickups" className="text-sm text-emerald-400 hover:underline">My pickups</Link>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Post when you need players — nearby GullySports users see it on their dashboard (up to 14 days ahead).
      </p>

      {geo.status === 'prompting' && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
          <Loader2 size={14} className="animate-spin" />
          Getting your location…
        </div>
      )}
      {geo.status === 'denied' && (
        <div className="mb-4 rounded-xl border border-amber-800/50 bg-amber-950/30 px-3 py-2.5 text-sm text-amber-200">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Location blocked</p>
              <p className="text-xs text-amber-300/80 mt-0.5">
                Pickups are matched by distance — please allow location access in your browser settings, then{' '}
                <button onClick={() => setTryAgain(t => t + 1)} className="underline text-amber-100">
                  try again
                </button>.
              </p>
            </div>
          </div>
        </div>
      )}
      {hasFix && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-900/40 px-3 py-2 text-xs text-gray-400">
          <MapPin size={14} className="text-emerald-400" />
          Location locked — {geo.fix?.lat.toFixed(4)}, {geo.fix?.lng.toFixed(4)}
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-5">
        <div>
          <label className="block text-xs uppercase tracking-wider text-gray-500 mb-2">Sport</label>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {SPORTS.map(s => (
              <button
                type="button" key={s.value}
                onClick={() => setSport(s.value)}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
                  sport === s.value
                    ? 'border-emerald-600 bg-emerald-950/40 text-emerald-300'
                    : 'border-gray-800 bg-gray-900 text-gray-400 hover:border-gray-700'
                }`}>
                <SportIcon sport={s.value} />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-gray-500 mb-2">
            Ground / venue
          </label>
          <input
            type="text"
            value={groundName}
            onChange={e => setGroundName(e.target.value)}
            placeholder="e.g. Cubbon Park, MG Road"
            maxLength={120}
            className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-emerald-600 outline-none"
          />
          <p className="mt-1 text-[11px] text-gray-600">We&apos;ll attach your current GPS pin automatically.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-2">Slots needed</label>
            <input
              type="number"
              min={1} max={15}
              value={slots}
              onChange={e => setSlots(e.target.value)}
              className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-600"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-2">Format</label>
            <input
              type="text"
              value={format}
              onChange={e => setFormat(e.target.value)}
              placeholder="T20, 5-a-side"
              maxLength={40}
              className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-gray-500 mb-2">When</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {START_PRESETS.map(p => (
              <button
                key={p.label} type="button"
                onClick={() => applyPresetMins(p.mins)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-800 bg-gray-900 text-gray-400 hover:border-gray-700 hover:text-gray-200 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            value={startLocal}
            min={localDatetimeFromNow(-60 * 1000)}
            max={maxScheduleLocalValue()}
            onChange={e => setStartLocal(e.target.value)}
            className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-600 [color-scheme:dark]"
          />
          <p className="mt-1 text-[11px] text-gray-600">
            Choose any day within the next {MAX_SCHEDULE_DAYS} days. Quick chips above snap to common times.
          </p>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-gray-500 mb-2">
            Notes <span className="text-gray-600">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Bring your own bat. ₹100 ground split. Casual play, all levels welcome."
            maxLength={200}
            rows={3}
            className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 outline-none focus:border-emerald-600 resize-none"
          />
          <p className="mt-1 text-[11px] text-gray-600 text-right">{notes.length}/200</p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-800/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !hasFix}
          className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          {busy ? 'Posting…' : 'Send ping to nearby players'}
        </button>
        <p className="text-[11px] text-gray-600 text-center">
          Stays open until filled or up to ~4 hours after start, then it expires automatically.
        </p>
      </form>
    </div>
  );
}
