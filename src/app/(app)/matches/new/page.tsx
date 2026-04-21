'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { SportType, Team } from '@/types';

const sports: { value: SportType; label: string; emoji: string }[] = [
  { value: 'cricket', label: 'Cricket', emoji: '🏏' },
  { value: 'football', label: 'Football', emoji: '⚽' },
  { value: 'badminton', label: 'Badminton', emoji: '🏸' },
];

function NewMatchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sport, setSport] = useState<SportType>((searchParams.get('sport') as SportType) ?? 'cricket');
  const [teamAName, setTeamAName] = useState('');
  const [teamBName, setTeamBName] = useState('');
  const [teamAId, setTeamAId] = useState('');
  const [teamBId, setTeamBId] = useState('');
  const [overs, setOvers] = useState('10');
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchTeams() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase
        .from('teams')
        .select('*')
        .eq('sport', sport)
        .eq('created_by', user!.id);
      setMyTeams(data ?? []);
    }
    fetchTeams();
  }, [sport]);

  function selectTeam(teamId: string, teamName: string, slot: 'a' | 'b') {
    if (slot === 'a') { setTeamAId(teamId); setTeamAName(teamName); }
    else { setTeamBId(teamId); setTeamBName(teamName); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (teamAName === teamBName) { setError('Teams must have different names'); return; }
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const matchPayload: Record<string, unknown> = {
      sport,
      team_a_name: teamAName,
      team_b_name: teamBName,
      team_a_id: teamAId || null,
      team_b_id: teamBId || null,
      status: 'upcoming',
      created_by: user!.id,
    };
    if (sport === 'cricket') matchPayload.cricket_overs = parseInt(overs);

    const { data: match, error: matchError } = await supabase
      .from('matches')
      .insert(matchPayload)
      .select()
      .single();

    if (matchError) { setError(matchError.message); setLoading(false); return; }

    // Create initial score rows
    await supabase.from('match_scores').insert([
      { match_id: match.id, team_id: teamAId || null, team_name: teamAName },
      { match_id: match.id, team_id: teamBId || null, team_name: teamBName },
    ]);

    router.push(`/matches/${match.id}`);
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-white mb-6">Create Match</h1>
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Sport selector */}
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

          {/* Cricket overs */}
          {sport === 'cricket' && (
            <Input
              label="Overs"
              type="number"
              min="1"
              max="50"
              value={overs}
              onChange={e => setOvers(e.target.value)}
            />
          )}

          {/* Teams */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input
                label="Team A"
                placeholder="Team name"
                value={teamAName}
                onChange={e => { setTeamAName(e.target.value); setTeamAId(''); }}
                required
              />
              {myTeams.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {myTeams.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => selectTeam(t.id, t.name, 'a')}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                        teamAId === t.id ? 'bg-emerald-900/40 border-emerald-600 text-emerald-400' : 'border-gray-700 text-gray-500 hover:border-gray-500'
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Input
                label="Team B"
                placeholder="Team name"
                value={teamBName}
                onChange={e => { setTeamBName(e.target.value); setTeamBId(''); }}
                required
              />
              {myTeams.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {myTeams.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => selectTeam(t.id, t.name, 'b')}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                        teamBId === t.id ? 'bg-emerald-900/40 border-emerald-600 text-emerald-400' : 'border-gray-700 text-gray-500 hover:border-gray-500'
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" loading={loading} size="lg">
            Start Match
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default function NewMatchPage() {
  return (
    <Suspense fallback={<div className="text-gray-400 text-sm">Loading...</div>}>
      <NewMatchForm />
    </Suspense>
  );
}
