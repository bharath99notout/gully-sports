'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { SportType } from '@/types';

const sports: { value: SportType; label: string; emoji: string }[] = [
  { value: 'cricket', label: 'Cricket', emoji: '🏏' },
  { value: 'football', label: 'Football', emoji: '⚽' },
  { value: 'badminton', label: 'Badminton', emoji: '🏸' },
];

export default function NewTeamPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sport, setSport] = useState<SportType>('cricket');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('teams')
      .insert({ name, sport, created_by: user!.id })
      .select()
      .single();
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push(`/teams/${data.id}`);
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold text-white mb-6">Create Team</h1>
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Input
            label="Team Name"
            placeholder="e.g. Street Warriors"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />

          <div>
            <label className="text-sm font-medium text-gray-300 block mb-2">Sport</label>
            <div className="flex gap-2">
              {sports.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSport(s.value)}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-lg border text-sm transition-colors ${
                    sport === s.value
                      ? 'border-emerald-500 bg-emerald-900/30 text-emerald-400'
                      : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <span className="text-xl">{s.emoji}</span>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" loading={loading} size="lg">
            Create Team
          </Button>
        </form>
      </Card>
    </div>
  );
}
