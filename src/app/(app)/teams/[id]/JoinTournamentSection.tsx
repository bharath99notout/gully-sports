'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type TournamentRow = {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  alreadyIn: boolean;
};

/**
 * Lets a team captain attach their team to any tournament in their team's
 * sport. Open registration — no approval workflow. RLS (migration 022)
 * permits team.created_by to insert into tournament_teams.
 *
 * Tournaments the team is already in are shown with an "In" badge instead
 * of a Join button so the captain knows where they stand.
 */
export default function JoinTournamentSection({
  teamId,
  teamSport,
}: {
  teamId: string;
  teamSport: string;
}) {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // tournament id currently joining
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const [{ data: ts }, { data: parts }] = await Promise.all([
      supabase
        .from('tournaments')
        .select('id, name, status, start_date, end_date')
        .eq('sport', teamSport)
        .neq('status', 'completed')
        .order('created_at', { ascending: false }),
      supabase
        .from('tournament_teams')
        .select('tournament_id')
        .eq('team_id', teamId),
    ]);
    const inSet = new Set((parts ?? []).map((p: { tournament_id: string }) => p.tournament_id));
    type TRow = { id: string; name: string; status: string; start_date: string | null; end_date: string | null };
    setTournaments((ts ?? []).map((t: TRow) => ({ ...t, alreadyIn: inSet.has(t.id) })));
    setLoading(false);
  }

  async function join(tournamentId: string) {
    setError('');
    setInfo('');
    setBusy(tournamentId);
    const supabase = createClient();

    // 1. Attach team to tournament
    const { error: ttErr } = await supabase
      .from('tournament_teams')
      .insert({ tournament_id: tournamentId, team_id: teamId });
    if (ttErr) {
      setBusy(null);
      setError(ttErr.message);
      return;
    }

    // 2. Snapshot the team's current members into the tournament's roster.
    //    Skip players who already belong to another team in this tournament
    //    and surface the names + which other team has them.
    const { data: members } = await supabase
      .from('team_members')
      .select('player_id, profiles(name)')
      .eq('team_id', teamId);

    type MemberRow = { player_id: string; profiles: { name: string } | { name: string }[] | null };
    const memberRows = ((members ?? []) as MemberRow[]).map(m => {
      const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return { player_id: m.player_id, name: prof?.name ?? 'Unknown' };
    });
    const memberIds = memberRows.map(m => m.player_id);

    let skipped: { name: string; otherTeamName: string }[] = [];
    if (memberIds.length > 0) {
      const { data: claimed } = await supabase
        .from('tournament_team_players')
        .select('player_id, team_id, teams(name)')
        .eq('tournament_id', tournamentId)
        .in('player_id', memberIds);

      type Existing = { player_id: string; team_id: string; teams: { name: string } | { name: string }[] | null };
      const takenById = new Map<string, string>();
      for (const row of (claimed ?? []) as Existing[]) {
        const teamObj = Array.isArray(row.teams) ? row.teams[0] : row.teams;
        takenById.set(row.player_id, teamObj?.name ?? 'another team');
      }

      const toInsert = memberRows
        .filter(m => !takenById.has(m.player_id))
        .map(m => ({ tournament_id: tournamentId, team_id: teamId, player_id: m.player_id }));

      skipped = memberRows
        .filter(m => takenById.has(m.player_id))
        .map(m => ({ name: m.name, otherTeamName: takenById.get(m.player_id)! }));

      if (toInsert.length > 0) {
        await supabase.from('tournament_team_players').insert(toInsert);
      }
    }

    setBusy(null);
    if (skipped.length > 0) {
      const lines = skipped.map(s => `${s.name} (on ${s.otherTeamName})`).join(', ');
      setInfo(
        `Joined! ${skipped.length} player${skipped.length === 1 ? '' : 's'} skipped — already on another team in this tournament: ${lines}.`
      );
    } else {
      setInfo('Joined! Your team is now in this tournament.');
    }
    await load();
    router.refresh();
  }

  const visible = query.trim()
    ? tournaments.filter(t => t.name.toLowerCase().includes(query.toLowerCase()))
    : tournaments;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Trophy size={16} className="text-emerald-400" />
        <h3 className="text-sm font-semibold text-white">Tournaments</h3>
      </div>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Open {teamSport.replace('_', ' ')} tournaments. Tap to join — your team enters with its current roster.
      </p>

      {loading && <p className="text-xs text-gray-500">Loading…</p>}

      {!loading && tournaments.length === 0 && (
        <p className="text-xs text-gray-500">
          No active {teamSport.replace('_', ' ')} tournaments yet.{' '}
          <Link href="/tournaments/new" className="text-emerald-400 hover:text-emerald-300">Create one</Link>?
        </p>
      )}

      {!loading && tournaments.length > 0 && (
        <>
          {tournaments.length > 5 && (
            <input
              type="text"
              placeholder="Search tournament…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          )}
          <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
            {visible.map(t => (
              <div key={t.id} className="bg-gray-800/60 border border-gray-800 rounded-xl px-3 py-2 flex items-center gap-2">
                <Link href={`/tournaments/${t.id}`} className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{t.name}</p>
                  <p className="text-[11px] text-gray-500 capitalize">
                    {t.status}
                    {t.start_date ? ` · ${t.start_date}` : ''}
                    {t.end_date ? ` → ${t.end_date}` : ''}
                  </p>
                </Link>
                {t.alreadyIn ? (
                  <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 font-medium shrink-0">
                    In
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => join(t.id)}
                    disabled={busy === t.id}
                    className="text-xs px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium shrink-0 disabled:opacity-60"
                  >
                    {busy === t.id ? 'Joining…' : 'Join'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {info && <p className="text-sm text-emerald-400">{info}</p>}
    </div>
  );
}
