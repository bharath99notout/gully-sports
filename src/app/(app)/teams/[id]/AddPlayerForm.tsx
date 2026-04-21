'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

export default function AddPlayerForm({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const supabase = createClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', (await supabase.from('profiles').select('id').limit(1)).data?.[0]?.id ?? '')
      .single();

    // Find user by looking up auth users via profile — search by matching name or use a direct lookup
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name')
      .ilike('name', `%${email}%`)
      .limit(5);

    if (!profiles || profiles.length === 0) {
      setError('No player found with that name. Ask them to sign up first.');
      setLoading(false);
      return;
    }

    const player = profiles[0];
    const { error: insertError } = await supabase
      .from('team_members')
      .insert({ team_id: teamId, player_id: player.id });

    if (insertError) {
      setError(insertError.code === '23505' ? 'Player already in team' : insertError.message);
    } else {
      setEmail('');
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleAdd} className="flex gap-2 items-end">
      <div className="flex-1">
        <Input
          label="Add Player by Name"
          placeholder="Search player name..."
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
      </div>
      <Button type="submit" loading={loading} size="md">Add</Button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </form>
  );
}
