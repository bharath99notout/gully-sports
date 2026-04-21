'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import { Plus, X } from 'lucide-react';
import { Match, MatchScore, MatchPlayer, CricketPlayerStat } from '@/types';

interface Props {
  match: Match;
  scoreA: MatchScore | null;
  scoreB: MatchScore | null;
  canEdit: boolean;
  matchPlayers: MatchPlayer[];
  playerStats: Record<string, CricketPlayerStat>;
}

const WICKET_TYPES = ['Bowled', 'LBW', 'Caught', 'Run Out', 'Stumped', 'Hit Wicket'];
const RUN_BTNS = [0, 1, 2, 3, 4, 6];

export default function CricketScorer({
  match,
  scoreA: initA,
  scoreB: initB,
  canEdit,
  matchPlayers: initPlayers,
  playerStats: initStats,
}: Props) {
  const supabase = createClient();
  const isLive = match.status === 'live';

  const [players, setPlayers] = useState<MatchPlayer[]>(initPlayers);
  const [stats, setStats] = useState<Record<string, CricketPlayerStat>>(initStats);
  const [scoreA, setScoreA] = useState(initA);
  const [scoreB, setScoreB] = useState(initB);

  const [battingTeam, setBattingTeamState] = useState<string | null>(match.batting_team_name ?? null);
  const [strikerId, setStrikerId] = useState<string | null>(match.striker_id ?? null);
  const [nonStrikerId, setNonStrikerId] = useState<string | null>(match.non_striker_id ?? null);
  const [bowlerId, setBowlerId] = useState<string | null>(match.bowler_id ?? null);

  const [wicketOpen, setWicketOpen] = useState(false);
  const [wicketType, setWicketType] = useState('Bowled');
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [catcherId, setCatcherId] = useState<string | null>(null);

  const [addTeam, setAddTeam] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchRes, setSearchRes] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  // ── helpers ──────────────────────────────────────────────────────────────

  const battingScore = battingTeam === match.team_a_name ? scoreA : scoreB;
  const battingPlayers = players.filter(p => p.team_name === battingTeam);
  const bowlingPlayers = players.filter(p => p.team_name !== battingTeam && p.team_name !== '');
  const getStats = (id: string | null): CricketPlayerStat =>
    (id && stats[id]) ? stats[id] : { runs_scored: 0, wickets_taken: 0, catches_taken: 0 };

  function patchScore(team: string, patch: Partial<MatchScore>) {
    if (team === match.team_a_name) setScoreA(p => p ? { ...p, ...patch } : p);
    else setScoreB(p => p ? { ...p, ...patch } : p);
  }

  async function saveMatchState(patch: Record<string, unknown>) {
    await supabase.from('matches').update(patch).eq('id', match.id);
  }

  async function upsertStat(pid: string, delta: Partial<CricketPlayerStat>) {
    const cur = getStats(pid);
    const next: CricketPlayerStat = {
      runs_scored: cur.runs_scored + (delta.runs_scored ?? 0),
      wickets_taken: cur.wickets_taken + (delta.wickets_taken ?? 0),
      catches_taken: cur.catches_taken + (delta.catches_taken ?? 0),
    };
    setStats(p => ({ ...p, [pid]: next }));
    await supabase.from('player_match_stats').upsert(
      { match_id: match.id, player_id: pid, sport: 'cricket', ...next },
      { onConflict: 'match_id,player_id' }
    );
  }

  // ── actions ───────────────────────────────────────────────────────────────

  async function setBatting(team: string) {
    setBattingTeamState(team);
    setStrikerId(null); setNonStrikerId(null); setBowlerId(null);
    await saveMatchState({ batting_team_name: team, striker_id: null, non_striker_id: null, bowler_id: null });
  }

  async function handleRuns(runs: number, isExtra = false) {
    if (!battingScore || !battingTeam || busy) return;
    setBusy(true);
    const newRuns = (battingScore.runs ?? 0) + runs;
    await supabase.from('match_scores').update({ runs: newRuns }).eq('id', battingScore.id);
    patchScore(battingTeam, { runs: newRuns });

    if (!isExtra && strikerId) await upsertStat(strikerId, { runs_scored: runs });

    // Swap on odd runs
    if (!isExtra && runs % 2 === 1 && strikerId && nonStrikerId) {
      const [ns, s] = [strikerId, nonStrikerId];
      setStrikerId(ns); setNonStrikerId(s);
      await saveMatchState({ striker_id: ns, non_striker_id: s });
    }
    setBusy(false);
  }

  async function confirmWicket() {
    if (!battingScore || !battingTeam || busy) return;
    setBusy(true);
    const newWickets = (battingScore.wickets ?? 0) + 1;
    await supabase.from('match_scores').update({ wickets: newWickets }).eq('id', battingScore.id);
    patchScore(battingTeam, { wickets: newWickets });

    if (bowlerId && wicketType !== 'Run Out') await upsertStat(bowlerId, { wickets_taken: 1 });
    if (wicketType === 'Caught' && catcherId) await upsertStat(catcherId, { catches_taken: 1 });

    const newStriker = dismissedId === strikerId ? null : strikerId;
    const newNonStriker = dismissedId === nonStrikerId ? null : nonStrikerId;
    setStrikerId(newStriker); setNonStrikerId(newNonStriker);
    await saveMatchState({ striker_id: newStriker, non_striker_id: newNonStriker });

    setWicketOpen(false); setCatcherId(null);
    setBusy(false);
  }

  async function handleSearch(q: string) {
    setSearchQ(q);
    if (q.length < 2) { setSearchRes([]); return; }
    const { data } = await supabase.from('profiles').select('id, name').ilike('name', `%${q}%`).limit(6);
    setSearchRes(data ?? []);
  }

  async function addPlayer(profile: { id: string; name: string }) {
    const team = addTeam!;
    const { error } = await supabase.from('match_players').insert({
      match_id: match.id, player_id: profile.id, team_name: team,
    });
    if (!error) {
      setPlayers(p => [...p, { id: crypto.randomUUID(), match_id: match.id, player_id: profile.id, team_name: team, name: profile.name }]);
    }
    setSearchQ(''); setSearchRes([]); setAddTeam(null);
  }

  async function removePlayer(mp: MatchPlayer) {
    await supabase.from('match_players').delete().eq('match_id', match.id).eq('player_id', mp.player_id);
    setPlayers(p => p.filter(x => x.player_id !== mp.player_id));
  }

  async function changeSelect(
    setter: (v: string | null) => void,
    key: string,
    val: string
  ) {
    const v = val || null;
    setter(v);
    await saveMatchState({ [key]: v });
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">

      {/* ── Score cards ── */}
      <div className="grid grid-cols-2 gap-3">
        {([
          { score: scoreA, team: match.team_a_name },
          { score: scoreB, team: match.team_b_name },
        ] as { score: MatchScore | null; team: string }[]).map(({ score, team }) => (
          <Card key={team} padding="md" className={battingTeam === team ? 'border-emerald-700' : ''}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-400 truncate">{team}</p>
              {battingTeam === team
                ? <span className="text-xs text-emerald-400 font-semibold">BATTING</span>
                : battingTeam && <span className="text-xs text-blue-400">BOWLING</span>}
            </div>
            <div className="text-3xl font-bold text-white">
              {score?.runs ?? 0}/{score?.wickets ?? 0}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{score?.overs_faced ?? 0} ov</div>
          </Card>
        ))}
      </div>

      {/* ── Read-only scorecard (non-editor or completed) ── */}
      {(!canEdit || !isLive) && players.length > 0 && (
        <PlayerScorecard
          players={players}
          stats={stats}
          teamA={match.team_a_name}
          teamB={match.team_b_name}
        />
      )}

      {canEdit && isLive && (
        <>
          {/* ── Choose batting team ── */}
          {!battingTeam && (
            <Card padding="md" className="text-center">
              <p className="text-sm text-gray-400 mb-3">Who is batting first?</p>
              <div className="flex gap-2 justify-center">
                {[match.team_a_name, match.team_b_name].map(t => (
                  <button key={t} onClick={() => setBatting(t)}
                    className="flex-1 py-2 px-3 bg-emerald-700 hover:bg-emerald-600 text-white text-sm rounded-xl font-medium">
                    {t}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {battingTeam && (
            <>
              {/* ── Player setup ── */}
              <Card padding="md">
                <h3 className="text-sm font-semibold text-white mb-3">Current Players</h3>
                <div className="flex flex-col gap-2.5">

                  <PlayerSelect
                    label="🏏 Striker"
                    options={battingPlayers}
                    value={strikerId}
                    stat={strikerId ? `${getStats(strikerId).runs_scored}*` : ''}
                    statColor="text-emerald-400"
                    onChange={v => changeSelect(setStrikerId, 'striker_id', v)}
                  />
                  <PlayerSelect
                    label="🏃 Non-striker"
                    options={battingPlayers}
                    value={nonStrikerId}
                    stat={nonStrikerId ? `${getStats(nonStrikerId).runs_scored}` : ''}
                    statColor="text-gray-400"
                    onChange={v => changeSelect(setNonStrikerId, 'non_striker_id', v)}
                  />
                  <PlayerSelect
                    label="🎳 Bowler"
                    options={bowlingPlayers}
                    value={bowlerId}
                    stat={bowlerId ? `${getStats(bowlerId).wickets_taken}W` : ''}
                    statColor="text-red-400"
                    onChange={v => changeSelect(setBowlerId, 'bowler_id', v)}
                  />

                </div>
              </Card>

              {/* ── Scoring buttons ── */}
              <Card padding="md">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Score</h3>
                  <span className="text-xs text-gray-500">{battingTeam} batting</span>
                </div>

                <div className="grid grid-cols-6 gap-2 mb-2">
                  {RUN_BTNS.map(r => (
                    <button key={r} onClick={() => handleRuns(r)} disabled={busy}
                      className={`py-3 rounded-xl font-bold text-lg transition-colors disabled:opacity-40 ${
                        r === 4 ? 'bg-blue-700 hover:bg-blue-600 text-white' :
                        r === 6 ? 'bg-purple-700 hover:bg-purple-600 text-white' :
                        'bg-gray-800 hover:bg-gray-700 text-white'
                      }`}>
                      {r}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2 mb-2">
                  <button onClick={() => handleRuns(1, true)} disabled={busy}
                    className="py-2.5 rounded-xl text-sm font-semibold bg-yellow-900/40 hover:bg-yellow-900/70 border border-yellow-700 text-yellow-300 disabled:opacity-40">
                    Wide (+1)
                  </button>
                  <button onClick={() => handleRuns(1, true)} disabled={busy}
                    className="py-2.5 rounded-xl text-sm font-semibold bg-orange-900/40 hover:bg-orange-900/70 border border-orange-700 text-orange-300 disabled:opacity-40">
                    No Ball
                  </button>
                  <button
                    onClick={() => { setDismissedId(strikerId); setWicketOpen(true); }}
                    disabled={busy}
                    className="py-2.5 rounded-xl text-sm font-bold bg-red-700 hover:bg-red-600 text-white disabled:opacity-40">
                    WICKET 🏏
                  </button>
                </div>

                {/* Overs */}
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-800">
                  <span className="text-xs text-gray-500">Overs faced:</span>
                  <input type="number" step="0.1" min={0}
                    defaultValue={battingScore?.overs_faced ?? 0}
                    className="w-20 text-center bg-gray-800 border border-gray-700 rounded-lg text-white text-sm py-1"
                    onBlur={async e => {
                      const v = parseFloat(e.target.value) || 0;
                      if (battingScore) {
                        await supabase.from('match_scores').update({ overs_faced: v }).eq('id', battingScore.id);
                        patchScore(battingTeam, { overs_faced: v });
                      }
                    }}
                  />
                </div>
              </Card>
            </>
          )}

          {/* ── Match players ── */}
          <Card padding="md">
            <h3 className="text-sm font-semibold text-white mb-3">Match Players</h3>
            <div className="grid grid-cols-2 gap-4">
              {[match.team_a_name, match.team_b_name].map(team => (
                <div key={team}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-400 truncate">{team}</p>
                    <button onClick={() => setAddTeam(team)}
                      className="flex items-center gap-0.5 text-xs text-emerald-400 hover:underline">
                      <Plus size={11} /> Add
                    </button>
                  </div>
                  {players.filter(p => p.team_name === team).map(p => {
                    const s = getStats(p.player_id);
                    return (
                      <div key={p.player_id} className="flex items-center justify-between py-1 border-b border-gray-800/50 last:border-0">
                        <span className="text-xs text-white">{p.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {s.runs_scored > 0 && `${s.runs_scored}r `}
                            {s.wickets_taken > 0 && `${s.wickets_taken}w `}
                            {s.catches_taken > 0 && `${s.catches_taken}c`}
                          </span>
                          <button onClick={() => removePlayer(p)}
                            className="text-gray-700 hover:text-red-400 transition-colors">
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {players.filter(p => p.team_name === team).length === 0 && (
                    <p className="text-xs text-gray-600 italic">No players yet</p>
                  )}
                </div>
              ))}
            </div>

            {/* Search & add */}
            {addTeam && (
              <div className="mt-4 pt-3 border-t border-gray-800">
                <p className="text-xs text-gray-400 mb-2">Add to <span className="text-white">{addTeam}</span></p>
                <input autoFocus type="text" placeholder="Type player name…" value={searchQ}
                  onChange={e => handleSearch(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {searchRes.length > 0 && (
                  <div className="mt-1 flex flex-col divide-y divide-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                    {searchRes.map(p => (
                      <button key={p.id} onClick={() => addPlayer(p)}
                        className="text-left px-3 py-2 bg-gray-800 hover:bg-gray-700 text-sm text-white">
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={() => { setAddTeam(null); setSearchQ(''); setSearchRes([]); }}
                  className="mt-1.5 text-xs text-gray-600 hover:text-gray-400">Cancel</button>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ── Wicket modal ── */}
      {wicketOpen && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-lg font-bold text-white mb-4">🏏 Wicket</h3>

            <div className="mb-4">
              <p className="text-xs text-gray-400 mb-2">Dismissal type</p>
              <div className="flex flex-wrap gap-1.5">
                {WICKET_TYPES.map(t => (
                  <button key={t} onClick={() => setWicketType(t)}
                    className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                      wicketType === t ? 'bg-red-700 text-white font-medium' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <p className="text-xs text-gray-400 mb-1">Dismissed batsman</p>
              <select value={dismissedId ?? ''} onChange={e => setDismissedId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2">
                <option value="">— select —</option>
                {battingPlayers.map(p => (
                  <option key={p.player_id} value={p.player_id}>{p.name}</option>
                ))}
              </select>
            </div>

            {wicketType === 'Caught' && (
              <div className="mb-4">
                <p className="text-xs text-gray-400 mb-1">Caught by</p>
                <select value={catcherId ?? ''} onChange={e => setCatcherId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2">
                  <option value="">— select fielder —</option>
                  {bowlingPlayers.map(p => (
                    <option key={p.player_id} value={p.player_id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {wicketType !== 'Run Out' && bowlerId && (
              <p className="text-xs text-gray-500 mb-4">
                Wicket credited to: <span className="text-white">{players.find(p => p.player_id === bowlerId)?.name}</span>
              </p>
            )}

            <div className="flex gap-2">
              <button onClick={() => setWicketOpen(false)}
                className="flex-1 py-2 rounded-xl bg-gray-800 text-gray-300 text-sm">Cancel</button>
              <button onClick={confirmWicket} disabled={busy}
                className="flex-1 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white font-bold text-sm disabled:opacity-40">
                {busy ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Read-only player scorecard ────────────────────────────────────────────────

function PlayerScorecard({
  players, stats, teamA, teamB,
}: {
  players: MatchPlayer[];
  stats: Record<string, CricketPlayerStat>;
  teamA: string;
  teamB: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[teamA, teamB].map(team => (
        <Card key={team} padding="sm">
          <p className="text-xs font-semibold text-gray-400 mb-2">{team}</p>
          {players.filter(p => p.team_name === team).map(p => {
            const s = stats[p.player_id] ?? { runs_scored: 0, wickets_taken: 0, catches_taken: 0 };
            return (
              <div key={p.player_id} className="flex justify-between py-0.5">
                <span className="text-xs text-white">{p.name}</span>
                <span className="text-xs text-gray-500">
                  {s.runs_scored > 0 && `${s.runs_scored}r `}
                  {s.wickets_taken > 0 && `${s.wickets_taken}w `}
                  {s.catches_taken > 0 && `${s.catches_taken}c`}
                </span>
              </div>
            );
          })}
        </Card>
      ))}
    </div>
  );
}

// ── Reusable player select row ────────────────────────────────────────────────

function PlayerSelect({
  label, options, value, stat, statColor, onChange,
}: {
  label: string;
  options: MatchPlayer[];
  value: string | null;
  stat: string;
  statColor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="flex-1 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-2 py-1.5 min-w-0"
      >
        <option value="">— select —</option>
        {options.map(p => (
          <option key={p.player_id} value={p.player_id}>{p.name}</option>
        ))}
      </select>
      {stat && <span className={`text-xs font-medium shrink-0 ${statColor}`}>{stat}</span>}
    </div>
  );
}
