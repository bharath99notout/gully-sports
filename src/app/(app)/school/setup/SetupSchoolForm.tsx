'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createSchool } from '@/app/actions/schoolSports';
import { SCHOOL_DEFAULT_CLASSES, SCHOOL_DEFAULT_HOUSES } from '@/lib/schoolSports';

export default function SetupSchoolForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [housesCsv, setHousesCsv] = useState(SCHOOL_DEFAULT_HOUSES.join(', '));
  const [classesCsv, setClassesCsv] = useState(SCHOOL_DEFAULT_CLASSES.join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const result = await createSchool({ name, housesCsv, classesCsv });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push('/school');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && (
        <div className="rounded-xl border border-red-900/70 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-gray-300">School name</span>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Green Valley School"
          required
          maxLength={120}
          className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-emerald-700 focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-gray-300">Houses</span>
        <input
          value={housesCsv}
          onChange={e => setHousesCsv(e.target.value)}
          placeholder="Red, Blue, Green, Yellow"
          className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-emerald-700 focus:outline-none"
        />
        <span className="text-[11px] text-gray-500">
          Comma separated. You can keep it simple and change names later in the database if needed.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-gray-300">Classes</span>
        <input
          value={classesCsv}
          onChange={e => setClassesCsv(e.target.value)}
          placeholder="Nursery, LKG, UKG, 1st, 2nd"
          className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-emerald-700 focus:outline-none"
        />
        <span className="text-[11px] text-gray-500">
          Comma separated. Events and student entry will use these class names.
        </span>
      </label>

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        Create school workspace
      </button>
    </form>
  );
}
