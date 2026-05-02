'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { SportType } from '@/types';

const sports: { value: SportType; label: string; emoji: string }[] = [
  { value: 'cricket',      label: 'Cricket',      emoji: '🏏' },
  { value: 'football',     label: 'Football',     emoji: '⚽' },
  { value: 'badminton',    label: 'Badminton',    emoji: '🏸' },
  { value: 'table_tennis', label: 'T. Tennis',    emoji: '🏓' },
];

/**
 * Team creation lives here, deliberately outside any tournament page.
 * Teams are a global concept and are reused across tournaments + 1-on-1 matches.
 *
 * `?return_to=...` opt-in: the AddTeam picker on a tournament page sends users
 * here with the tournament URL pre-set so we can land them back where they
 * started after the team is created (and even auto-attach the new team to
 * that tournament when `?attach_tournament=...` is also set).
 */
function NewTeamForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('return_to');                 // e.g. /tournaments/<id>
  const attachTournament = searchParams.get('attach_tournament'); // tournament id to auto-attach
  const sportParam = searchParams.get('sport') as SportType | null;

  const [name, setName] = useState('');
  const [sport, setSport] = useState<SportType>(sportParam ?? 'cricket');
  const [sportLocked] = useState(Boolean(sportParam));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachContext, setAttachContext] = useState<{ name: string } | null>(null);

  // If we'll attach to a tournament after creation, fetch its name to render
  // the "← Back to Sunday League" breadcrumb.
  useEffect(() => {
    if (!attachTournament) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('tournaments').select('name').eq('id', attachTournament).maybeSingle();
      if (data?.name) setAttachContext({ name: data.name });
    })();
  }, [attachTournament]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: team, error: createErr } = await supabase
      .from('teams')
      .insert({ name, sport, created_by: user!.id })
      .select()
      .single();

    if (createErr || !team) {
      setError(createErr?.message ?? 'Could not create team');
      setLoading(false);
      return;
    }

    // Optional auto-attach: when arriving from an "Add team" picker.
    if (attachTournament) {
      const { error: attachErr } = await supabase
        .from('tournament_teams')
        .insert({ tournament_id: attachTournament, team_id: team.id });
      if (attachErr) {
        // Non-fatal — user can still attach manually. Log + carry on.
        console.warn('[NewTeam] auto-attach failed:', attachErr.message);
      }
    }

    if (returnTo) {
      router.push(returnTo);
      return;
    }
    router.push(`/teams/${team.id}`);
  }

  return (
    <div className="max-w-md">
      {attachContext ? (
        <Link
          href={returnTo ?? '/teams'}
          className="text-xs text-gray-500 hover:text-gray-300 inline-flex items-center gap-1 mb-3"
        >
          ← Back to {attachContext.name}
        </Link>
      ) : (
        <Link href="/teams" className="text-xs text-gray-500 hover:text-gray-300 inline-flex items-center gap-1 mb-3">
          ← Teams
        </Link>
      )}

      <h1 className="text-2xl font-bold text-white mb-1">Create Team</h1>
      {attachContext && (
        <p className="text-sm text-gray-500 mb-6">
          Will be added to <span className="text-emerald-400">{attachContext.name}</span> after creation.
        </p>
      )}
      {!attachContext && <div className="mb-6" />}

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
            <label className="text-sm font-medium text-gray-300 block mb-2">
              Sport {sportLocked && <span className="text-[11px] text-emerald-400 font-normal">· locked by tournament</span>}
            </label>
            <div className="flex gap-2 flex-wrap">
              {sports.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => !sportLocked && setSport(s.value)}
                  disabled={sportLocked && sport !== s.value}
                  className={`flex-1 min-w-[70px] flex flex-col items-center gap-1 py-3 rounded-lg border text-sm transition-colors ${
                    sport === s.value
                      ? 'border-emerald-500 bg-emerald-900/30 text-emerald-400'
                      : sportLocked
                        ? 'border-gray-800 bg-gray-900 text-gray-700 cursor-not-allowed'
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

export default function NewTeamPage() {
  return (
    <Suspense fallback={<div className="max-w-md" />}>
      <NewTeamForm />
    </Suspense>
  );
}
