'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Award as AwardIcon, Trash2, UserPlus, Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import PlayerSearchAndAdd, { type PlayerAddResult } from '@/components/PlayerSearchAndAdd';
import type { Leaderboards, StandingRow, PlayerAggregate } from '@/lib/tournament';

type TournamentLite = {
  id: string;
  name: string;
  sport: string;
  status: string;
};

type TeamView = {
  id: string;
  name: string;
  players: { id: string; name: string; avatar_url: string | null }[];
};

type MatchView = {
  id: string;
  status: string;
  played_at: string;
  team_a_name: string;
  team_b_name: string;
  winner_team_name: string | null;
};

type AwardView = {
  award_type: string;
  label: string;
  player_id: string;
  player_name: string;
  display_value: string;
};

type FrozenAwardView = AwardView & { avatar_url: string | null };

type Tab = 'overview' | 'matches' | 'standings' | 'leaderboard' | 'awards';

type Props = {
  tournament: TournamentLite;
  isOrganizer: boolean;
  teams: TeamView[];
  matches: MatchView[];
  standings: StandingRow[];
  leaderboards: Leaderboards;
  liveAwards: AwardView[];
  liveMop: PlayerAggregate | null;
  frozenAwards: FrozenAwardView[];
};

export default function TournamentTabsClient(props: Props) {
  const { tournament, isOrganizer, teams, matches, standings, leaderboards, liveAwards, liveMop, frozenAwards } = props;
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div>
      <nav className="flex gap-1 mb-4 border-b border-gray-800 overflow-x-auto">
        {(['overview', 'matches', 'standings', 'leaderboard', 'awards'] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium capitalize transition-colors border-b-2 ${
              tab === t
                ? 'text-emerald-400 border-emerald-400'
                : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <OverviewTab
          tournament={tournament}
          isOrganizer={isOrganizer}
          teams={teams}
          matches={matches}
          standings={standings}
          frozenAwards={frozenAwards}
        />
      )}
      {tab === 'matches'     && <MatchesTab tournament={tournament} matches={matches} isOrganizer={isOrganizer} />}
      {tab === 'standings'   && <StandingsTab standings={standings} />}
      {tab === 'leaderboard' && <LeaderboardTab leaderboards={leaderboards} />}
      {tab === 'awards'      && (
        <AwardsTab
          tournament={tournament}
          isOrganizer={isOrganizer}
          liveAwards={liveAwards}
          liveMop={liveMop}
          frozenAwards={frozenAwards}
        />
      )}
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────

function OverviewTab({
  tournament, isOrganizer, teams, matches, standings, frozenAwards,
}: {
  tournament: TournamentLite;
  isOrganizer: boolean;
  teams: TeamView[];
  matches: MatchView[];
  standings: StandingRow[];
  frozenAwards: FrozenAwardView[];
}) {
  const completedMatches = matches.filter(m => m.status === 'completed').length;
  const upcomingMatches = matches.filter(m => m.status !== 'completed').length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Teams" value={teams.length} />
        <Stat label="Matches played" value={completedMatches} />
        <Stat label="Pending" value={upcomingMatches} />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Teams ({teams.length})</h3>
          {tournament.status !== 'completed' && (
            <AddTeamButton
              tournamentId={tournament.id}
              sport={tournament.sport}
              isOrganizer={isOrganizer}
            />
          )}
        </div>
        {teams.length === 0 ? (
          <p className="text-sm text-gray-500">No teams yet. Add one to get started.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {teams.map(t => (
              <TeamRow
                key={t.id}
                team={t}
                tournamentId={tournament.id}
                canRemove={isOrganizer && tournament.status !== 'completed'}
              />
            ))}
          </div>
        )}
      </div>

      {standings.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Top of the table</h3>
          <div className="flex flex-col gap-1.5">
            {standings.slice(0, 3).map((s, i) => (
              <div key={s.team_name} className="flex items-center gap-3 text-sm">
                <span className="w-6 text-center text-gray-500 font-mono">{i + 1}</span>
                <span className="flex-1 text-white">{s.team_name}</span>
                <span className="text-emerald-400 font-semibold">{s.points} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {frozenAwards.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5">
            <Trophy size={14} className="text-emerald-400" /> Final awards
          </h3>
          <div className="flex flex-col gap-2">
            {frozenAwards.map(a => (
              <AwardCard key={a.award_type} a={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

// ── Matches ─────────────────────────────────────────────────────────────────

function MatchesTab({ tournament, matches, isOrganizer }: { tournament: TournamentLite; matches: MatchView[]; isOrganizer: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {isOrganizer && tournament.status !== 'completed' && (
        <Link
          href={`/matches/new?tournament_id=${tournament.id}`}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-medium text-sm text-center"
        >
          + Create match in this tournament
        </Link>
      )}
      {matches.length === 0 ? (
        <p className="text-sm text-gray-500 bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
          No matches yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {matches.map(m => (
            <Link
              key={m.id}
              href={`/matches/${m.id}`}
              className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-3 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white truncate">
                  {m.team_a_name} <span className="text-gray-500 font-normal">vs</span> {m.team_b_name}
                </p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  m.status === 'completed' ? 'bg-gray-800 text-gray-400'
                : m.status === 'live'      ? 'bg-emerald-500/15 text-emerald-300'
                :                            'bg-blue-500/10 text-blue-300'
                }`}>{m.status}</span>
              </div>
              {m.winner_team_name && (
                <p className="text-[11px] text-emerald-400 mt-1">🏆 {m.winner_team_name}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Standings ───────────────────────────────────────────────────────────────

function StandingsTab({ standings }: { standings: StandingRow[] }) {
  if (standings.length === 0) {
    return <p className="text-sm text-gray-500 bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">No matches played yet.</p>;
  }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <table className="w-full text-sm">
        <thead className="text-[11px] text-gray-500 uppercase">
          <tr>
            <th className="text-left font-medium pb-2">#</th>
            <th className="text-left font-medium pb-2">Team</th>
            <th className="text-center font-medium pb-2">P</th>
            <th className="text-center font-medium pb-2">W</th>
            <th className="text-center font-medium pb-2">L</th>
            <th className="text-right font-medium pb-2">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr key={s.team_name} className="border-t border-gray-800/60">
              <td className="text-gray-500 py-2 font-mono">{i + 1}</td>
              <td className="text-white py-2">{s.team_name}</td>
              <td className="text-gray-400 text-center">{s.played}</td>
              <td className="text-emerald-400 text-center">{s.won}</td>
              <td className="text-gray-400 text-center">{s.lost}</td>
              <td className="text-white font-semibold text-right">{s.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Leaderboard ─────────────────────────────────────────────────────────────

function LeaderboardTab({ leaderboards }: { leaderboards: Leaderboards }) {
  if (leaderboards.primary.every(l => l.entries.length === 0)) {
    return <p className="text-sm text-gray-500 bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">No stats yet — leaderboards build up as matches finish.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {leaderboards.primary.map(lb => (
        <div key={lb.key} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">{lb.label}</h3>
          {lb.entries.length === 0 ? (
            <p className="text-xs text-gray-500">No data yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {lb.entries.map((e, i) => (
                <div key={e.player_id} className="flex items-center gap-3 text-sm">
                  <span className={`w-6 text-center font-mono ${
                    i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-orange-400' : 'text-gray-500'
                  }`}>{i + 1}</span>
                  <span className="flex-1 text-white">{e.player_name}</span>
                  <span className="text-emerald-400 font-semibold tabular-nums">{e.display}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Awards ──────────────────────────────────────────────────────────────────

function AwardsTab({
  tournament, isOrganizer, liveAwards, liveMop, frozenAwards,
}: {
  tournament: TournamentLite;
  isOrganizer: boolean;
  liveAwards: AwardView[];
  liveMop: PlayerAggregate | null;
  frozenAwards: FrozenAwardView[];
}) {
  const isCompleted = tournament.status === 'completed';
  const showFrozen = frozenAwards.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {showFrozen ? (
        <div className="flex flex-col gap-2">
          {frozenAwards.map(a => <AwardCard key={a.award_type} a={a} />)}
        </div>
      ) : (
        <>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3">
            <p className="text-xs text-amber-200">
              <strong>Live leaderboard awards.</strong> Final awards are frozen when the organizer ends the tournament.
            </p>
          </div>

          {liveMop && (
            <div className="bg-gradient-to-br from-emerald-500/15 to-emerald-700/5 border border-emerald-500/30 rounded-2xl p-5 text-center">
              <AwardIcon size={28} className="text-emerald-400 mx-auto mb-2" />
              <p className="text-[11px] text-emerald-300 uppercase tracking-wider font-semibold">Player of the Tournament</p>
              <p className="text-lg font-bold text-white mt-1">{liveMop.player_name}</p>
              <p className="text-xs text-gray-400 mt-0.5">Impact score {liveMop.impact}</p>
            </div>
          )}

          {liveAwards.length === 0 ? (
            <p className="text-sm text-gray-500 bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
              Awards appear once players accumulate stats.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {liveAwards.filter(a => a.award_type !== 'mop').map(a => (
                <AwardCard key={a.award_type} a={a} />
              ))}
            </div>
          )}
        </>
      )}

      {isOrganizer && !isCompleted && (
        <EndTournamentButton tournamentId={tournament.id} />
      )}
    </div>
  );
}

function AwardCard({ a }: { a: AwardView }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-3">
      <span className="w-9 h-9 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
        <AwardIcon size={16} className="text-emerald-400" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-500 uppercase tracking-wider">{a.label}</p>
        <p className="text-sm font-semibold text-white truncate">{a.player_name}</p>
      </div>
      <span className="text-xs text-emerald-400 font-medium tabular-nums shrink-0">{a.display_value}</span>
    </div>
  );
}

// ── Mutations: Add team / Remove team / End tournament ─────────────────────

type TeamCandidate = {
  id: string;
  name: string;
  ownerName: string;
  ownedByMe: boolean;
  otherTournaments: number;
};

function AddTeamButton({
  tournamentId, sport, isOrganizer,
}: { tournamentId: string; sport: string; isOrganizer: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [allTeams, setAllTeams] = useState<TeamCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function openModal() {
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setError('Sign in first'); return; }

    // Organizer: any team in the sport. Non-organizer: only their own teams
    // (RLS would reject inserts for teams they don't own anyway, and showing
    // them in the picker would be a dead-end click).
    const teamsQuery = supabase
      .from('teams').select('id, name, created_by, profiles:created_by(name)')
      .eq('sport', sport);
    const { data: candidates } = isOrganizer
      ? await teamsQuery
      : await teamsQuery.eq('created_by', user.id);

    const { data: participations } = await supabase
      .from('tournament_teams')
      .select('tournament_id, team_id');

    const tournamentsByTeam = new Map<string, Set<string>>();
    for (const row of (participations ?? []) as { tournament_id: string; team_id: string }[]) {
      let s = tournamentsByTeam.get(row.team_id);
      if (!s) { s = new Set(); tournamentsByTeam.set(row.team_id, s); }
      s.add(row.tournament_id);
    }

    type TeamRow = { id: string; name: string; created_by: string; profiles: { name: string } | { name: string }[] | null };
    const available: TeamCandidate[] = (candidates ?? [])
      .filter((t: TeamRow) => !tournamentsByTeam.get(t.id)?.has(tournamentId))
      .map((t: TeamRow) => {
        const owner = Array.isArray(t.profiles) ? t.profiles[0] : t.profiles;
        return {
          id: t.id,
          name: t.name,
          ownerName: owner?.name ?? 'Unknown',
          ownedByMe: t.created_by === user.id,
          otherTournaments: tournamentsByTeam.get(t.id)?.size ?? 0,
        };
      })
      // My own teams float to the top, then alphabetical
      .sort((a, b) => Number(b.ownedByMe) - Number(a.ownedByMe) || a.name.localeCompare(b.name));

    setAllTeams(available);
    setLoading(false);
    setOpen(true);
  }

  const filteredTeams = query.trim()
    ? allTeams.filter(t =>
        t.name.toLowerCase().includes(query.toLowerCase()) ||
        t.ownerName.toLowerCase().includes(query.toLowerCase()))
    : allTeams.slice(0, 30);

  async function addTeam(teamId: string) {
    setError('');
    setLoading(true);
    const supabase = createClient();

    // Insert team into tournament
    const { error: insertErr } = await supabase
      .from('tournament_teams')
      .insert({ tournament_id: tournamentId, team_id: teamId });
    if (insertErr) {
      setLoading(false);
      setError(insertErr.message);
      return;
    }

    // Snapshot the team's current members into tournament_team_players, but skip
    // anyone who's already on another team in this tournament.
    const { data: members } = await supabase
      .from('team_members').select('player_id').eq('team_id', teamId);

    const memberIds = (members ?? []).map((m: { player_id: string }) => m.player_id);
    if (memberIds.length > 0) {
      const { data: existing } = await supabase
        .from('tournament_team_players')
        .select('player_id')
        .eq('tournament_id', tournamentId)
        .in('player_id', memberIds);
      const taken = new Set((existing ?? []).map((r: { player_id: string }) => r.player_id));
      const toInsert = memberIds
        .filter(pid => !taken.has(pid))
        .map(pid => ({ tournament_id: tournamentId, team_id: teamId, player_id: pid }));
      if (toInsert.length > 0) {
        await supabase.from('tournament_team_players').insert(toInsert);
      }
    }
    setLoading(false);
    window.location.reload();
  }

  if (!open) {
    return (
      <button type="button" onClick={openModal} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
        <UserPlus size={12} /> {isOrganizer ? 'Add team' : 'Join with your team'}
      </button>
    );
  }

  // Round-trip: send the user to the global team-creation page with the
  // return URL + attach hints so they bounce back here with the new team
  // already attached. Team creation always lives at /teams/new.
  const createTeamHref =
    `/teams/new?sport=${encodeURIComponent(sport)}` +
    `&attach_tournament=${encodeURIComponent(tournamentId)}` +
    `&return_to=${encodeURIComponent(`/tournaments/${tournamentId}`)}`;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm p-5 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-white">
          {isOrganizer ? 'Add team' : 'Join with your team'}
        </h3>
        {loading && <p className="text-xs text-gray-500">Loading teams…</p>}

        <p className="text-[11px] text-gray-500 leading-relaxed">
          {isOrganizer
            ? `Search any ${sport.replace('_', ' ')} team in the community. Your teams appear first.`
            : `Pick one of your ${sport.replace('_', ' ')} teams to join this tournament.`}
        </p>

        {isOrganizer && (
          <input
            type="text"
            placeholder="Search team name or captain…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        )}

        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {filteredTeams.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => addTeam(t.id)}
              disabled={loading}
              className="text-left text-sm text-white bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{t.name}</span>
                {t.otherTournaments > 0 && (
                  <span className="text-[10px] text-emerald-400/70 shrink-0">
                    in {t.otherTournaments} other
                  </span>
                )}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                {t.ownedByMe ? 'Your team' : `Captain: ${t.ownerName}`}
              </div>
            </button>
          ))}
        </div>

        {!loading && allTeams.length === 0 && (
          <p className="text-xs text-gray-500">
            {isOrganizer
              ? `No ${sport.replace('_', ' ')} teams exist yet. Create the first one below.`
              : `You don't have a ${sport.replace('_', ' ')} team yet. Create one below.`}
          </p>
        )}
        {!loading && allTeams.length > 0 && filteredTeams.length === 0 && query.trim() && (
          <p className="text-xs text-gray-500">No team matches that search.</p>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Link
          href={createTeamHref}
          className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 pt-1 border-t border-gray-800/60 mt-1"
        >
          + Create a new team
        </Link>

        <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-gray-300">
          Cancel
        </button>
      </div>
    </div>
  );
}

function TeamRow({ team, tournamentId, canRemove }: { team: TeamView; tournamentId: string; canRemove: boolean }) {
  const [removing, setRemoving] = useState(false);

  async function remove() {
    if (!confirm(`Remove ${team.name} from this tournament?`)) return;
    setRemoving(true);
    const supabase = createClient();
    await supabase.from('tournament_team_players')
      .delete().eq('tournament_id', tournamentId).eq('team_id', team.id);
    await supabase.from('tournament_teams')
      .delete().eq('tournament_id', tournamentId).eq('team_id', team.id);
    window.location.reload();
  }

  async function removePlayer(playerId: string) {
    if (!confirm('Remove this player from the team?')) return;
    const supabase = createClient();
    await supabase.from('tournament_team_players')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('team_id', team.id)
      .eq('player_id', playerId);
    window.location.reload();
  }

  return (
    <div className="bg-gray-800/50 border border-gray-800 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-white">{team.name}</p>
        {canRemove && (
          <button
            type="button"
            onClick={remove}
            disabled={removing}
            className="text-gray-500 hover:text-red-400"
            aria-label="Remove team"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {team.players.length === 0 ? (
        <p className="text-[11px] text-gray-500 mb-2">No players yet.</p>
      ) : (
        <ul className="flex flex-col gap-1 mb-2">
          {team.players.map(p => (
            <li key={p.id} className="flex items-center justify-between text-[12px] text-gray-300 bg-gray-900/40 rounded-md px-2 py-1">
              <span className="truncate">{p.name}</span>
              {canRemove && (
                <button
                  type="button"
                  onClick={() => removePlayer(p.id)}
                  className="text-gray-500 hover:text-red-400 ml-2"
                  aria-label={`Remove ${p.name}`}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canRemove && (
        <AddPlayerButton
          tournamentId={tournamentId}
          teamId={team.id}
          teamName={team.name}
          existingPlayerIds={team.players.map(p => p.id)}
        />
      )}
    </div>
  );
}

// ── Add Player to a tournament team — wraps the shared PlayerSearchAndAdd ──

function AddPlayerButton({
  tournamentId, teamId, teamName, existingPlayerIds,
}: { tournamentId: string; teamId: string; teamName: string; existingPlayerIds: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function addPlayer(playerId: string, displayName: string): Promise<PlayerAddResult> {
    const supabase = createClient();

    // 1. Tournament roster (UNIQUE(tournament_id, player_id) enforces one-team-per-player).
    const { error: ttpErr } = await supabase
      .from('tournament_team_players')
      .insert({ tournament_id: tournamentId, team_id: teamId, player_id: playerId });

    if (ttpErr) {
      const msg = ttpErr.message.toLowerCase();
      if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('23505')) {
        const { data: existingRow } = await supabase
          .from('tournament_team_players')
          .select('team_id')
          .eq('tournament_id', tournamentId)
          .eq('player_id', playerId)
          .maybeSingle();
        if (existingRow?.team_id === teamId) {
          return { ok: false, error: `${displayName} is already on this team.` };
        }
        return { ok: false, error: `${displayName} is already in another team in this tournament.` };
      }
      return { ok: false, error: ttpErr.message || 'Could not add player' };
    }

    // 2. Also add to global team_members (idempotent — UNIQUE(team_id, player_id) catches dupes).
    const { error: tmErr } = await supabase
      .from('team_members')
      .insert({ team_id: teamId, player_id: playerId });
    if (tmErr) {
      const msg = tmErr.message.toLowerCase();
      if (!msg.includes('duplicate') && !msg.includes('unique')) {
        console.warn('[AddPlayer] team_members insert non-fatal failure:', tmErr.message);
      }
    }
    return { ok: true };
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
      >
        <UserPlus size={12} /> Add player
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm p-5 flex flex-col gap-3">
        <PlayerSearchAndAdd
          onAdd={addPlayer}
          excludePlayerIds={existingPlayerIds}
          heading={`Add player to ${teamName}`}
          hint="Search by name or 10-digit phone. Create new if not found — phone numbers are never duplicated."
          onSuccess={() => { setOpen(false); router.refresh(); }}
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-gray-500 hover:text-gray-300 self-end"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function EndTournamentButton({ tournamentId }: { tournamentId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function endIt() {
    if (!confirm('End the tournament? Awards will be frozen and team rosters locked. This cannot be undone.')) return;
    setError('');
    setLoading(true);
    const res = await fetch('/api/tournaments/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournament_id: tournamentId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Could not end tournament');
      setLoading(false);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 flex flex-col gap-2">
      <p className="text-xs text-red-200">Once ended, awards freeze and leaderboards stop updating.</p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button type="button" size="md" loading={loading} onClick={endIt}>
        End tournament & finalize awards
      </Button>
    </div>
  );
}
