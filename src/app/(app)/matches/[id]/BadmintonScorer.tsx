'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Match, MatchScore, MatchPlayer } from '@/types';
import { Minus, Plus, X, UserPlus } from 'lucide-react';

interface Props {
  match: Match;
  scoreA: MatchScore | null;
  scoreB: MatchScore | null;
  canEdit: boolean;
  allowDisputeRecheck?: boolean;
  matchPlayers: MatchPlayer[];
}

function teamLabel(name: string) {
  return /^\d+$/.test(name.trim()) ? `Team ${name.trim()}` : name;
}

// Winner detection: first team to win ceil(bestOf/2) sets
function detectWinner(setsA: number[], setsB: number[], target: number, bestOf: number): 0 | 1 | null {
  const needed = Math.ceil(bestOf / 2);
  let wonA = 0, wonB = 0;
  for (let i = 0; i < Math.max(setsA.length, setsB.length); i++) {
    const a = setsA[i] ?? 0, b = setsB[i] ?? 0;
    if (a >= target && a > b) wonA += 1;
    else if (b >= target && b > a) wonB += 1;
  }
  if (wonA >= needed) return 0;
  if (wonB >= needed) return 1;
  return null;
}

export default function BadmintonScorer({
  match,
  scoreA,
  scoreB,
  canEdit,
  allowDisputeRecheck = false,
  matchPlayers: initPlayers,
}: Props) {
  const supabase = createClient();
  const isLive = match.status === 'live';
  const scoringActive = isLive || (match.status === 'completed' && allowDisputeRecheck);
  const totalSets = match.badminton_sets ?? 3;
  const target    = match.badminton_target_points ?? 21;

  const [players, setPlayers] = useState<MatchPlayer[]>(initPlayers);
  const [setsA, setSetsA] = useState<number[]>(() => {
    const src = scoreA?.sets ?? [];
    return Array.from({ length: totalSets }, (_, i) => src[i] ?? 0);
  });
  const [setsB, setSetsB] = useState<number[]>(() => {
    const src = scoreB?.sets ?? [];
    return Array.from({ length: totalSets }, (_, i) => src[i] ?? 0);
  });
  const [busy, setBusy] = useState(false);

  // Player search/add state
  const [addTeam, setAddTeam] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchRes, setSearchRes] = useState<{ id: string; name: string; phone?: string | null }[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // Direct-edit state
  const [editCell, setEditCell] = useState<{ team: 'a' | 'b'; idx: number } | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const winnerIdx = detectWinner(setsA, setsB, target, totalSets);

  const playersA = players.filter(p => p.team_name === match.team_a_name);
  const playersB = players.filter(p => p.team_name === match.team_b_name);

  const format: 'singles' | 'doubles' = (playersA.length >= 2 || playersB.length >= 2) ? 'doubles' : 'singles';

  // Current set = first incomplete
  function currentSetIndex(): number {
    for (let i = 0; i < totalSets; i++) {
      const a = setsA[i] ?? 0, b = setsB[i] ?? 0;
      if (a < target && b < target) return i;
    }
    return totalSets - 1;
  }
  const activeSet = currentSetIndex();

  async function saveSets(team: 'a' | 'b', arr: number[]) {
    const scoreId = team === 'a' ? scoreA?.id : scoreB?.id;
    if (scoreId) await supabase.from('match_scores').update({ sets: arr }).eq('id', scoreId);
  }

  async function updatePoint(team: 'a' | 'b', idx: number, delta: number) {
    if (!canEdit || !scoringActive || busy) return;
    setBusy(true);
    const current = team === 'a' ? setsA : setsB;
    const next = [...current];
    next[idx] = Math.max(0, (next[idx] ?? 0) + delta);
    if (team === 'a') setSetsA(next); else setSetsB(next);
    await saveSets(team, next);
    setBusy(false);
  }

  async function setPointDirect(team: 'a' | 'b', idx: number, value: number) {
    if (!canEdit) return;
    const current = team === 'a' ? setsA : setsB;
    const next = [...current];
    next[idx] = Math.max(0, Math.min(999, Math.floor(value || 0)));
    if (team === 'a') setSetsA(next); else setSetsB(next);
    await saveSets(team, next);
  }

  // ── Player management ──────────────────────────────────────────────────────

  async function handleSearch(q: string) {
    setSearchQ(q);
    if (q.length < 2) { setSearchRes([]); return; }
    const [{ data: byName }, { data: byPhone }] = await Promise.all([
      supabase.from('profiles').select('id, name, phone').ilike('name', `%${q}%`).limit(6),
      supabase.from('profiles').select('id, name, phone').ilike('phone', `%${q}%`).limit(6),
    ]);
    const combined = [...(byName ?? []), ...(byPhone ?? [])];
    const seen = new Set<string>();
    setSearchRes(combined.filter(p => !seen.has(p.id) && !!seen.add(p.id)).slice(0, 8));
  }

  async function addPlayer(profile: { id: string; name: string }) {
    const team = addTeam!;
    const { data } = await supabase.from('match_players').insert({
      match_id: match.id, player_id: profile.id, team_name: team,
    }).select('id').single();
    if (data) {
      setPlayers(p => [...p, { id: data.id, match_id: match.id, player_id: profile.id, team_name: team, name: profile.name }]);
    }
    setSearchQ(''); setSearchRes([]); setAddTeam(null);
  }

  async function createAndAddPlayer() {
    const cleanName = newName.trim();
    const cleanPhone = newPhone.replace(/\D/g, '').slice(-10);
    if (!cleanName) { alert('Enter a name'); return; }
    if (cleanPhone.length !== 10) { alert('Phone must be 10 digits'); return; }
    setBusy(true);

    // Snapshot our session BEFORE any auth op — signUp auto-signs-in the new
    // user and @supabase/ssr may clobber our session cookies.
    const { data: { session: mySession } } = await supabase.auth.getSession();

    try {
      const { data: existing } = await supabase.from('profiles')
        .select('id, name').eq('phone', cleanPhone).maybeSingle();
      if (existing) {
        await addPlayer({ id: existing.id, name: existing.name || cleanName });
        return;
      }
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
      if (error || !signup.user) {
        alert('Could not create player: ' + (error?.message ?? 'unknown')); return;
      }
      await addPlayer({ id: signup.user.id, name: cleanName });
    } finally {
      // Restore ORIGINAL session — undo any cookie clobber from signUp
      if (mySession) {
        await supabase.auth.setSession({
          access_token: mySession.access_token,
          refresh_token: mySession.refresh_token,
        });
      }
      setBusy(false);
      setNewOpen(false); setNewName(''); setNewPhone('');
    }
  }

  async function removePlayer(mp: MatchPlayer) {
    await supabase.from('match_players').delete().eq('match_id', match.id).eq('player_id', mp.player_id);
    setPlayers(p => p.filter(x => x.player_id !== mp.player_id));
  }

  // ── End match — persist stats for all players ─────────────────────────────

  async function declareMatch() {
    if (winnerIdx === null || busy) return;
    setBusy(true);
    const winnerName = winnerIdx === 0 ? match.team_a_name : match.team_b_name;
    const winnerId   = winnerIdx === 0 ? match.team_a_id   : match.team_b_id;

    // Attribute stats to every player who played (singles or doubles).
    // A badminton player_match_stats row is just a match-played marker; the
    // leaderboard derives wins/sets/clean_sweeps from match_scores + winner.
    const statRows = players.map(p => ({
      match_id: match.id,
      player_id: p.player_id,
      sport: match.sport, // keep the match's sport — badminton or table_tennis
      runs_scored: 0,
      wickets_taken: 0,
      catches_taken: 0,
      goals_scored: 0,
    }));
    if (statRows.length > 0) {
      await supabase.from('player_match_stats').upsert(statRows, { onConflict: 'match_id,player_id' });
    }

    await supabase.from('matches').update({
      status: 'completed',
      winner_team_id:   winnerId ?? null,
      winner_team_name: winnerName,
    }).eq('id', match.id);
    window.location.reload();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const canScore = playersA.length >= 1 && playersB.length >= 1;

  return (
    <div className="flex flex-col gap-4">

      {allowDisputeRecheck && (
        <div className="rounded-xl border border-amber-700/50 bg-amber-950/35 px-3 py-2.5 text-sm text-amber-100">
          <span className="font-semibold text-amber-300">Disputed — scorer recheck.</span>{' '}
          Fix set scores or roster below; saving updates clears disputes and re-opens confirmations.
        </div>
      )}

      {/* ── Player management — visible when live/editable and any side empty ── */}
      {canEdit && scoringActive && (playersA.length === 0 || playersB.length === 0) && (
        <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl p-3">
          <p className="text-xs text-amber-300 font-semibold">
            ⚠️ Add at least one player to each side before scoring.
          </p>
        </div>
      )}

      {/* ── Scorecard ─────────────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-800 bg-gray-800/40 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
              {match.status === 'completed' && !allowDisputeRecheck
                ? 'Final Result'
                : scoringActive && canScore
                  ? `Live · Set ${activeSet + 1}`
                  : 'Setup'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Game to {target} · {totalSets === 1 ? '1 set' : `Best of ${totalSets}`}
              {format === 'doubles' && <span className="text-emerald-500 ml-1.5">· Doubles</span>}
            </p>
          </div>
          {winnerIdx !== null && match.status === 'live' && canEdit && (
            <button onClick={declareMatch} disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50">
              End Match
            </button>
          )}
        </div>

        {/* Column headers */}
        <div className="grid gap-2 px-4 py-2 border-b border-gray-800/60"
          style={{ gridTemplateColumns: `1fr repeat(${totalSets}, 3.25rem)` }}>
          <span className="text-[10px] text-gray-600 font-semibold uppercase">Players</span>
          {Array.from({ length: totalSets }, (_, i) => (
            <span key={i} className={`text-[10px] text-center font-semibold uppercase ${
              i === activeSet && scoringActive ? 'text-emerald-400' : 'text-gray-600'
            }`}>
              Set {i + 1}
            </span>
          ))}
        </div>

        {/* Row A */}
        <BadmintonRow
          teamName={match.team_a_name} teamPlayers={playersA}
          sets={setsA} target={target}
          isWinner={winnerIdx === 0} dim={winnerIdx === 1}
          activeSet={activeSet} scoringActive={scoringActive} canEdit={canEdit}
          onUpdate={(idx, d) => updatePoint('a', idx, d)}
          onRemovePlayer={removePlayer}
          onAddClick={() => { setAddTeam(match.team_a_name); setSearchQ(''); setSearchRes([]); }}
          editCell={editCell?.team === 'a' ? editCell.idx : null}
          onStartEdit={(idx) => setEditCell({ team: 'a', idx })}
          onFinishEdit={async (idx, value) => { setEditCell(null); await setPointDirect('a', idx, value); }}
          editInputRef={editInputRef}
        />

        {/* Row B */}
        <BadmintonRow
          teamName={match.team_b_name} teamPlayers={playersB}
          sets={setsB} target={target}
          isWinner={winnerIdx === 1} dim={winnerIdx === 0}
          activeSet={activeSet} scoringActive={scoringActive} canEdit={canEdit}
          onUpdate={(idx, d) => updatePoint('b', idx, d)}
          onRemovePlayer={removePlayer}
          onAddClick={() => { setAddTeam(match.team_b_name); setSearchQ(''); setSearchRes([]); }}
          editCell={editCell?.team === 'b' ? editCell.idx : null}
          onStartEdit={(idx) => setEditCell({ team: 'b', idx })}
          onFinishEdit={async (idx, value) => { setEditCell(null); await setPointDirect('b', idx, value); }}
          editInputRef={editInputRef}
        />
      </div>

      {/* ── Add player modal ────────────────────────────────────────────────── */}
      {canEdit && scoringActive && addTeam && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-300">
              Add player to <span className="font-bold text-white">{teamLabel(addTeam)}</span>
            </p>
            <button onClick={() => { setAddTeam(null); setNewOpen(false); }}
              className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
          </div>

          <input autoFocus type="text" placeholder="Search by name or mobile…" value={searchQ}
            onChange={e => handleSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />

          {searchRes.length > 0 && (
            <div className="mt-2 flex flex-col divide-y divide-gray-800 border border-gray-700 rounded-lg overflow-hidden">
              {searchRes.map(p => (
                <button key={p.id} onClick={() => addPlayer(p)}
                  className="text-left px-3 py-2 bg-gray-800 hover:bg-gray-700 flex items-center justify-between">
                  <span className="text-sm text-white">{p.name}</span>
                  {p.phone && <span className="text-xs text-gray-500">{p.phone}</span>}
                </button>
              ))}
            </div>
          )}

          {searchQ.trim().length >= 2 && searchRes.length === 0 && !newOpen && (
            <button onClick={() => { setNewName(searchQ.trim()); setNewPhone(''); setNewOpen(true); }}
              className="mt-2 w-full text-left px-3 py-2.5 bg-emerald-950/40 hover:bg-emerald-950/60 border border-emerald-800/60 rounded-lg flex items-center gap-2">
              <UserPlus size={14} className="text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-emerald-300 font-semibold truncate">Add &ldquo;{searchQ.trim()}&rdquo; as a new player</p>
                <p className="text-[11px] text-gray-500">Creates a profile so stats count</p>
              </div>
            </button>
          )}

          {newOpen && (
            <div className="mt-2 p-3 bg-gray-800/40 border border-emerald-800/60 rounded-lg flex flex-col gap-2">
              <p className="text-xs font-semibold text-emerald-300">Create new player</p>
              <input type="text" placeholder="Player name" value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white" />
              <input type="tel" inputMode="numeric" placeholder="10-digit mobile" value={newPhone}
                onChange={e => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white" />
              <div className="flex gap-2 mt-1">
                <button onClick={() => { setNewOpen(false); setNewName(''); setNewPhone(''); }}
                  className="flex-1 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-400">Cancel</button>
                <button onClick={createAndAddPlayer} disabled={busy || !newName.trim() || newPhone.length !== 10}
                  className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white disabled:opacity-40">
                  {busy ? 'Creating…' : 'Create & Add'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {match.status === 'completed' && winnerIdx !== null && (
        <div className="bg-emerald-950/30 border border-emerald-700/50 rounded-xl px-4 py-3 text-center">
          <p className="text-base font-bold text-white">
            🏆 <span className="text-emerald-300">
              {playersA.length > 0 && winnerIdx === 0
                ? playersA.map(p => p.name).join(' / ')
                : playersB.length > 0 && winnerIdx === 1
                ? playersB.map(p => p.name).join(' / ')
                : teamLabel(winnerIdx === 0 ? match.team_a_name : match.team_b_name)}
            </span> won
          </p>
        </div>
      )}
    </div>
  );
}

// ── Team row (with players + set scores + inline edit) ────────────────────────

interface RowProps {
  teamName: string;
  teamPlayers: MatchPlayer[];
  sets: number[];
  target: number;
  isWinner: boolean;
  dim: boolean;
  activeSet: number;
  scoringActive: boolean;
  canEdit: boolean;
  onUpdate: (idx: number, delta: number) => void;
  onRemovePlayer: (mp: MatchPlayer) => void;
  onAddClick: () => void;
  editCell: number | null;
  onStartEdit: (idx: number) => void;
  onFinishEdit: (idx: number, value: number) => Promise<void>;
  editInputRef: React.RefObject<HTMLInputElement | null>;
}

function BadmintonRow({
  teamName, teamPlayers, sets, target, isWinner, dim, activeSet, scoringActive, canEdit,
  onUpdate, onRemovePlayer, onAddClick, editCell, onStartEdit, onFinishEdit, editInputRef,
}: RowProps) {
  const display = teamLabel(teamName);
  return (
    <div className="grid gap-2 px-4 py-3 border-b border-gray-800/40 last:border-0 items-center"
      style={{ gridTemplateColumns: `1fr repeat(${sets.length}, 3.25rem)` }}>

      {/* Team / players column */}
      <div className="flex items-start gap-2 min-w-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 border mt-0.5 ${
          isWinner ? 'bg-emerald-900/60 border-emerald-700 text-emerald-200' : 'bg-gray-800 border-gray-700 text-gray-400'
        }`}>
          {display.replace(/^Team\s+/, '').slice(0, 3).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold truncate ${dim ? 'text-gray-600' : 'text-gray-400'}`}>
            {display}
          </p>
          {teamPlayers.length === 0 ? (
            canEdit && scoringActive ? (
              <button onClick={onAddClick}
                className="text-xs text-emerald-400 hover:underline mt-0.5 flex items-center gap-1">
                <UserPlus size={11} /> Add player
              </button>
            ) : (
              <p className="text-xs text-gray-600 italic mt-0.5">No players</p>
            )
          ) : (
            <div className="flex flex-col gap-0.5 mt-0.5">
              {teamPlayers.map(p => (
                <div key={p.player_id} className="flex items-center gap-1.5">
                  <span className={`text-sm font-bold truncate ${dim ? 'text-gray-500' : 'text-white'}`}>
                    {p.name}
                  </span>
                  {canEdit && scoringActive && (
                    <button onClick={() => onRemovePlayer(p)}
                      className="text-gray-700 hover:text-red-400 shrink-0">
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
              {canEdit && scoringActive && teamPlayers.length < 2 && (
                <button onClick={onAddClick}
                  className="text-[11px] text-emerald-500 hover:underline flex items-center gap-0.5 mt-0.5">
                  <UserPlus size={10} /> Add teammate (doubles)
                </button>
              )}
            </div>
          )}
          {isWinner && <p className="text-[10px] text-emerald-400 font-bold leading-none mt-1">◀ WINNER</p>}
        </div>
      </div>

      {/* Set score cells */}
      {sets.map((pts, i) => {
        const oppPts = (sets as unknown as { _opp?: number[] })._opp?.[i] ?? 0; // unused but safe
        void oppPts;
        const setWon = pts >= target;
        const isActive = i === activeSet && scoringActive;
        const isEditing = editCell === i;
        return (
          <div key={i} className="flex flex-col items-center gap-1">
            {isEditing ? (
              <input ref={editInputRef} type="number" inputMode="numeric" defaultValue={pts}
                onBlur={e => onFinishEdit(i, parseInt(e.target.value) || 0)}
                onKeyDown={e => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  else if (e.key === 'Escape') onFinishEdit(i, pts);
                }}
                autoFocus
                className="w-12 text-center text-xl font-black tabular-nums bg-gray-800 border border-emerald-500 rounded text-white px-1 py-0 focus:outline-none" />
            ) : (
              <button
                disabled={!canEdit}
                onClick={() => canEdit && onStartEdit(i)}
                className={`text-xl font-black tabular-nums transition-colors ${
                  setWon ? 'text-emerald-400' : dim ? 'text-gray-600' : 'text-white'
                } ${canEdit ? 'cursor-text hover:bg-gray-800/60 rounded px-1' : ''}`}
                title={canEdit ? 'Tap to edit' : undefined}>
                {pts}
              </button>
            )}
            {canEdit && scoringActive && isActive && !isWinner && !isEditing && (
              <div className="flex gap-1">
                <button onClick={() => onUpdate(i, -1)} disabled={pts === 0}
                  className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-white flex items-center justify-center">
                  <Minus size={10} />
                </button>
                <button onClick={() => onUpdate(i, +1)}
                  className="w-6 h-6 rounded bg-emerald-700 hover:bg-emerald-600 text-white flex items-center justify-center">
                  <Plus size={10} />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
