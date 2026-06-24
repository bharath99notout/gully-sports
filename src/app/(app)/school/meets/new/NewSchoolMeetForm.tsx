'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createSchoolMeet } from '@/app/actions/schoolSports';

function defaultDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewSchoolMeetForm({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const [name, setName] = useState('Annual Sports Day');
  const [meetDate, setMeetDate] = useState(defaultDate());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const result = await createSchoolMeet({ schoolId, name, meetDate });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/school/meets/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <p className="rounded-xl border border-red-900/70 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</p>}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-gray-300">Meet name</span>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          required
          maxLength={120}
          className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-emerald-700 focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-gray-300">Date</span>
        <input
          type="date"
          value={meetDate}
          onChange={e => setMeetDate(e.target.value)}
          required
          className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-sm text-white focus:border-emerald-700 focus:outline-none"
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        Create meet
      </button>
    </form>
  );
}
