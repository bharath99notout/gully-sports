'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { SportType, Team } from '@/types';
import { UserPlus, X, Search } from 'lucide-react';

const sports: { value: SportType; label: string; emoji: string }[] = [
  { value: 'cricket',      label: 'Cricket',   emoji: '🏏' },
  { value: 'football',     label: 'Football',  emoji: '⚽' },
  { value: 'badminton',    label: 'Badminton', emoji: '🏸' },
  { value: 'table_tennis', label: 'T. Tennis', emoji: '🏓' },
];

interface PickedPlayer { id: string; name: string; }

function NewMatchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sport, setSport] = useState<SportType>((searchParams.get('sport') as SportType) ?? 'cricket');
  const [teamAName, setTeamAName] = useState('');
  const [teamBName, setTeamBName] = useState('');
  const [teamAId, setTeamAId] = useState('');
  const [teamBId, setTeamBId] = useState('');
  const [overs, setOvers] = useState('10');
  const [badmintonTarget, setBadmintonTarget] = useState<15 | 21>(21);
  const [badmintonBestOf, setBadmintonBestOf] = useState<1 | 3 | 5>(3);
  const [ttTarget, setTtTarget] = useState<11 | 15 | 21>(11);
  const [ttBestOf, setTtBestOf] = useState<1 | 3 | 5 | 7>(5);
  const [myTeams, setMyTeams] = useState<Team[]>([]);

  // Badminton: player pickers (up to 2 per side for doubles)
  const [sideAPlayers, setSideAPlayers] = useState<PickedPlayer[]>([]);
  const [sideBPlayers, setSideBPlayers] = useState<PickedPlayer[]>([]);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchTeams() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase
        .from('teams').select('*').eq('sport', sport).eq('created_by', user!.id);
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
    setError('');

    let sideAName = teamAName;
    let sideBName = teamBName;

    const isRacket = sport === 'badminton' || sport === 'table_tennis';

    if (isRacket) {
      if (sideAPlayers.length === 0 || sideBPlayers.length === 0) {
        setError('Add at least one player to each side'); return;
      }
      sideAName = sideAPlayers.map(p => p.name).join(' / ');
      sideBName = sideBPlayers.map(p => p.name).join(' / ');
      if (sideAName === sideBName) sideBName = sideBName + ' (B)';
    } else {
      if (!teamAName.trim() || !teamBName.trim()) { setError('Team names required'); return; }
      if (teamAName === teamBName) { setError('Teams must have different names'); return; }
    }

    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const matchPayload: Record<string, unknown> = {
      sport,
      team_a_name: sideAName,
      team_b_name: sideBName,
      team_a_id: teamAId || null,
      team_b_id: teamBId || null,
      status: isRacket ? 'live' : 'upcoming', // racket sports ready to score immediately
      created_by: user!.id,
    };
    if (sport === 'cricket') matchPayload.cricket_overs = parseInt(overs);
    if (sport === 'badminton') {
      matchPayload.badminton_sets = badmintonBestOf;
      matchPayload.badminton_target_points = badmintonTarget;
    }
    if (sport === 'table_tennis') {
      matchPayload.tt_sets = ttBestOf;
      matchPayload.tt_target_points = ttTarget;
    }

    const { data: match, error: matchError } = await supabase
      .from('matches').insert(matchPayload).select().single();

    if (matchError) { setError(matchError.message); setLoading(false); return; }

    await supabase.from('match_scores').insert([
      { match_id: match.id, team_id: teamAId || null, team_name: sideAName },
      { match_id: match.id, team_id: teamBId || null, team_name: sideBName },
    ]);

    // For racket sports: also insert match_players rows
    if (isRacket) {
      const mpRows = [
        ...sideAPlayers.map(p => ({ match_id: match.id, player_id: p.id, team_name: sideAName })),
        ...sideBPlayers.map(p => ({ match_id: match.id, player_id: p.id, team_name: sideBName })),
      ];
      if (mpRows.length > 0) await supabase.from('match_players').insert(mpRows);
    }

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
                <button key={s.value} type="button" onClick={() => setSport(s.value)}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-lg border text-sm transition-colors ${
                    sport === s.value
                      ? 'border-emerald-500 bg-emerald-900/30 text-emerald-400'
                      : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                  }`}>
                  <span className="text-xl">{s.emoji}</span>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cricket overs */}
          {sport === 'cricket' && (
            <Input label="Overs" type="number" min="1" max="50"
              value={overs} onChange={e => setOvers(e.target.value)} />
          )}

          {/* Table Tennis options */}
          {sport === 'table_tennis' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-gray-300 block mb-2">Game to</label>
                <div className="flex gap-2">
                  {([11, 15, 21] as const).map(n => (
                    <button key={n} type="button" onClick={() => setTtTarget(n)}
                      className={`flex-1 py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                        ttTarget === n
                          ? 'border-emerald-500 bg-emerald-900/30 text-emerald-400'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                      }`}>
                      {n} points
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-600 mt-1">First to {ttTarget} wins the game.</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-300 block mb-2">Format</label>
                <div className="flex gap-2">
                  {([1, 3, 5, 7] as const).map(n => (
                    <button key={n} type="button" onClick={() => setTtBestOf(n)}
                      className={`flex-1 py-2.5 rounded-lg border text-xs font-semibold transition-colors ${
                        ttBestOf === n
                          ? 'border-emerald-500 bg-emerald-900/30 text-emerald-400'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                      }`}>
                      {n === 1 ? '1 game' : `Best of ${n}`}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-600 mt-1">Add up to 2 players per side — 2 makes it doubles.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <SidePicker label="Side A" players={sideAPlayers} setPlayers={setSideAPlayers} />
                <SidePicker label="Side B" players={sideBPlayers} setPlayers={setSideBPlayers} />
              </div>
            </div>
          )}

          {/* Badminton options */}
          {sport === 'badminton' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-gray-300 block mb-2">Game to</label>
                <div className="flex gap-2">
                  {([15, 21] as const).map(n => (
                    <button key={n} type="button" onClick={() => setBadmintonTarget(n)}
                      className={`flex-1 py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                        badmintonTarget === n
                          ? 'border-emerald-500 bg-emerald-900/30 text-emerald-400'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                      }`}>
                      {n} points
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-600 mt-1">First to {badmintonTarget} wins the set.</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-300 block mb-2">Format</label>
                <div className="flex gap-2">
                  {([1, 3, 5] as const).map(n => (
                    <button key={n} type="button" onClick={() => setBadmintonBestOf(n)}
                      className={`flex-1 py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                        badmintonBestOf === n
                          ? 'border-emerald-500 bg-emerald-900/30 text-emerald-400'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                      }`}>
                      {n === 1 ? '1 set' : `Best of ${n}`}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-600 mt-1">
                  Add up to 2 players per side — 2 makes it doubles.
                </p>
              </div>

              {/* Player pickers */}
              <div className="grid grid-cols-2 gap-3">
                <SidePicker label="Side A" players={sideAPlayers} setPlayers={setSideAPlayers} />
                <SidePicker label="Side B" players={sideBPlayers} setPlayers={setSideBPlayers} />
              </div>
            </div>
          )}

          {/* Cricket / Football team name inputs */}
          {sport !== 'badminton' && sport !== 'table_tennis' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input label="Team A" placeholder="Team name" value={teamAName}
                  onChange={e => { setTeamAName(e.target.value); setTeamAId(''); }} required />
                {myTeams.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {myTeams.map(t => (
                      <button key={t.id} type="button" onClick={() => selectTeam(t.id, t.name, 'a')}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                          teamAId === t.id ? 'bg-emerald-900/40 border-emerald-600 text-emerald-400' : 'border-gray-700 text-gray-500 hover:border-gray-500'
                        }`}>{t.name}</button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Input label="Team B" placeholder="Team name" value={teamBName}
                  onChange={e => { setTeamBName(e.target.value); setTeamBId(''); }} required />
                {myTeams.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {myTeams.map(t => (
                      <button key={t.id} type="button" onClick={() => selectTeam(t.id, t.name, 'b')}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                          teamBId === t.id ? 'bg-emerald-900/40 border-emerald-600 text-emerald-400' : 'border-gray-700 text-gray-500 hover:border-gray-500'
                        }`}>{t.name}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" loading={loading} size="lg">
            Start Match
          </Button>
        </form>
      </Card>
    </div>
  );
}

// ── Side picker (search + add + create new) ──────────────────────────────────

function SidePicker({ label, players, setPlayers }: {
  label: string;
  players: PickedPlayer[];
  setPlayers: React.Dispatch<React.SetStateAction<PickedPlayer[]>>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; phone?: string | null }[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [busy, setBusy] = useState(false);

  async function search(val: string) {
    setQ(val);
    if (val.length < 2) { setResults([]); return; }
    const supabase = createClient();
    const [{ data: byName }, { data: byPhone }] = await Promise.all([
      supabase.from('profiles').select('id, name, phone').ilike('name', `%${val}%`).limit(6),
      supabase.from('profiles').select('id, name, phone').ilike('phone', `%${val}%`).limit(6),
    ]);
    const combined = [...(byName ?? []), ...(byPhone ?? [])];
    const seen = new Set<string>();
    setResults(combined.filter(p => !seen.has(p.id) && !!seen.add(p.id)).slice(0, 8));
  }

  function pick(p: { id: string; name: string }) {
    if (players.some(x => x.id === p.id)) return; // already picked
    if (players.length >= 2) return;               // max 2
    setPlayers(prev => [...prev, { id: p.id, name: p.name }]);
    setQ(''); setResults([]); setOpen(false);
  }

  async function createNew() {
    const cleanName = newName.trim();
    const cleanPhone = newPhone.replace(/\D/g, '').slice(-10);
    if (!cleanName) { alert('Enter a name'); return; }
    if (cleanPhone.length !== 10) { alert('Phone must be 10 digits'); return; }
    setBusy(true);
    const supabase = createClient();
    // Snapshot our session — signUp can clobber it
    const { data: { session: mySession } } = await supabase.auth.getSession();

    try {
      const { data: existing } = await supabase.from('profiles')
        .select('id, name').eq('phone', cleanPhone).maybeSingle();
      if (existing) { pick({ id: existing.id, name: existing.name || cleanName }); return; }

      const { createBrowserClient } = await import('@supabase/ssr');
      const tempClient = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      const { data: signup, error } = await tempClient.auth.signUp({
        email: `${cleanPhone}@live.com`, password: cleanPhone.slice(-6),
        options: { data: { name: cleanName } },
      });
      if (error || !signup.user) { alert('Could not create player: ' + (error?.message ?? 'error')); return; }
      pick({ id: signup.user.id, name: cleanName });
    } finally {
      // Restore ORIGINAL session so the match creator doesn't get replaced
      if (mySession) {
        await supabase.auth.setSession({
          access_token: mySession.access_token,
          refresh_token: mySession.refresh_token,
        });
      }
      setBusy(false);
      setCreating(false); setNewName(''); setNewPhone('');
    }
  }

  return (
    <div>
      <label className="text-sm font-medium text-gray-300 block mb-2">{label}</label>

      {/* Selected players */}
      <div className="flex flex-col gap-1.5 mb-2">
        {players.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5">
            <div className="w-6 h-6 rounded-full bg-emerald-700 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
              {p.name[0]?.toUpperCase() ?? '?'}
            </div>
            <span className="text-sm text-white truncate flex-1">{p.name}</span>
            <button type="button" onClick={() => setPlayers(prev => prev.filter((_, j) => j !== i))}
              className="text-gray-600 hover:text-red-400 shrink-0"><X size={12} /></button>
          </div>
        ))}
      </div>

      {/* Add button */}
      {players.length < 2 && !open && (
        <button type="button" onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-gray-700 rounded-lg text-xs text-gray-400 hover:text-emerald-400 hover:border-emerald-700 transition-colors">
          <UserPlus size={12} />
          {players.length === 0 ? 'Add player' : 'Add teammate (doubles)'}
        </button>
      )}

      {/* Search / create panel */}
      {open && (
        <div className="border border-gray-700 rounded-lg p-2 bg-gray-900/60 flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Search size={12} className="text-gray-500 shrink-0" />
            <input autoFocus type="text" placeholder="Name or mobile…" value={q}
              onChange={e => search(e.target.value)}
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none" />
            <button type="button" onClick={() => { setOpen(false); setQ(''); setResults([]); setCreating(false); }}
              className="text-gray-500 hover:text-gray-300"><X size={12} /></button>
          </div>

          {results.length > 0 && (
            <div className="flex flex-col divide-y divide-gray-800 border border-gray-800 rounded overflow-hidden">
              {results.map(p => (
                <button key={p.id} type="button" onClick={() => pick(p)}
                  className="text-left px-2 py-1.5 bg-gray-800 hover:bg-gray-700 flex items-center justify-between">
                  <span className="text-sm text-white">{p.name}</span>
                  {p.phone && <span className="text-[10px] text-gray-500">{p.phone}</span>}
                </button>
              ))}
            </div>
          )}

          {q.trim().length >= 2 && results.length === 0 && !creating && (
            <button type="button" onClick={() => { setNewName(q.trim()); setNewPhone(''); setCreating(true); }}
              className="w-full text-left px-2 py-1.5 bg-emerald-950/40 hover:bg-emerald-950/60 border border-emerald-800/60 rounded flex items-center gap-1.5">
              <UserPlus size={12} className="text-emerald-400 shrink-0" />
              <span className="text-xs text-emerald-300 font-semibold truncate">Add &ldquo;{q.trim()}&rdquo; as new player</span>
            </button>
          )}

          {creating && (
            <div className="flex flex-col gap-1.5 p-2 bg-gray-800/40 border border-emerald-800/60 rounded">
              <input type="text" placeholder="Player name" value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white" />
              <input type="tel" inputMode="numeric" placeholder="10-digit mobile" value={newPhone}
                onChange={e => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white" />
              <div className="flex gap-1">
                <button type="button" onClick={() => { setCreating(false); setNewName(''); setNewPhone(''); }}
                  className="flex-1 py-1 rounded bg-gray-800 border border-gray-700 text-[11px] text-gray-400">Cancel</button>
                <button type="button" onClick={createNew} disabled={busy || !newName.trim() || newPhone.length !== 10}
                  className="flex-1 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-[11px] font-bold text-white disabled:opacity-40">
                  {busy ? '…' : 'Create'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
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
