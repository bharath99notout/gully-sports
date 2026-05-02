'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import type { SportType } from '@/types';

const SPORTS: { value: SportType; label: string; emoji: string }[] = [
  { value: 'cricket',      label: 'Cricket',      emoji: '🏏' },
  { value: 'football',     label: 'Football',     emoji: '⚽' },
  { value: 'badminton',    label: 'Badminton',    emoji: '🏸' },
  { value: 'table_tennis', label: 'Table Tennis', emoji: '🏓' },
];

export default function NewTournamentPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sport, setSport] = useState<SportType>('cricket');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Enter a tournament name'); return; }
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = '/auth/login'; return; }

    const { data, error: insertErr } = await supabase
      .from('tournaments')
      .insert({
        name: name.trim(),
        sport,
        format: 'league',
        status: 'upcoming',
        start_date: startDate || null,
        end_date: endDate || null,
        description: description.trim() || null,
        created_by: user.id,
      })
      .select('id')
      .single();

    setLoading(false);
    if (insertErr || !data) {
      setError(insertErr?.message ?? 'Could not create tournament');
      return;
    }
    router.push(`/tournaments/${data.id}`);
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/tournaments" className="text-xs text-gray-500 hover:text-gray-300">
          ← Tournaments
        </Link>
      </div>

      <h1 className="text-xl font-semibold text-white flex items-center gap-2 mb-1">
        <Trophy size={20} className="text-emerald-400" /> New tournament
      </h1>
      <p className="text-sm text-gray-500 mb-6">League format. One sport per tournament.</p>

      <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-4">
        <div>
          <label className="text-xs font-medium text-gray-400 mb-1.5 block">Tournament name</label>
          <input
            type="text"
            placeholder="Sunday League 2026"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-400 mb-1.5 block">Sport</label>
          <div className="grid grid-cols-2 gap-2">
            {SPORTS.map(s => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSport(s.value)}
                className={`p-3 rounded-xl border text-sm font-medium flex items-center gap-2 transition-colors ${
                  sport === s.value
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                    : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
                }`}
              >
                <span className="text-lg">{s.emoji}</span> {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-400 mb-1.5 block">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-400 mb-1.5 block">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-400 mb-1.5 block">Description (optional)</label>
          <textarea
            placeholder="Friends in the gully — best of 6 weekends"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Button type="submit" loading={loading} size="lg" disabled={!name.trim()}>
          Create tournament
        </Button>
      </form>
    </div>
  );
}
