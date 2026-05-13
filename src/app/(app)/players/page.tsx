import { getServerAuth } from '@/lib/supabase/server';
import { AthleteCardMini } from '@/components/AthleteCard';
import PlayerSearchWidget from '@/components/PlayerSearchWidget';
import { buildAthleteData, enrichStatsWithTeamNames, type RawStat } from '@/lib/athleteData';
import { getTrustScoresForPlayers } from '@/lib/trustScoreServer';

type MatchMeta = {
  id: string;
  winner_team_id: string | null;
  winner_team_name: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  team_a_name: string | null;
  team_b_name: string | null;
  confirmation_state: string | null;
};

type FlatPlayerStat = {
  player_id: string;
  sport: string;
  runs_scored: number | null;
  wickets_taken: number | null;
  catches_taken: number | null;
  goals_scored: number | null;
  match_id: string;
};

export default async function PlayersPage() {
  const { supabase } = await getServerAuth();

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, avatar_url, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  const players = profiles ?? [];
  const playerIds = players.map(p => p.id);

  if (playerIds.length === 0) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Players</h1>
          <p className="text-sm text-gray-500 mt-0.5">Search by name or mobile, or browse recent players below</p>
        </div>
        <PlayerSearchWidget />
        <div className="text-center py-12 text-gray-600">No players found.</div>
      </div>
    );
  }

  const [{ data: flatStats }, { data: mpRows }, trustScores] = await Promise.all([
    supabase
      .from('player_match_stats')
      .select('player_id, sport, runs_scored, wickets_taken, catches_taken, goals_scored, match_id')
      .in('player_id', playerIds),
    supabase
      .from('match_players')
      .select('match_id, player_id, team_name')
      .in('player_id', playerIds),
    getTrustScoresForPlayers(playerIds, supabase),
  ]);

  const statsList = (flatStats ?? []) as FlatPlayerStat[];
  const matchIds = [...new Set(statsList.map(s => s.match_id))];

  const { data: matchRows } = matchIds.length > 0
    ? await supabase
        .from('matches')
        .select('id, winner_team_id, winner_team_name, team_a_id, team_b_id, team_a_name, team_b_name, confirmation_state')
        .in('id', matchIds)
    : { data: [] as MatchMeta[] };

  const matchById = new Map<string, MatchMeta>();
  for (const m of (matchRows ?? []) as MatchMeta[]) {
    matchById.set(m.id, m);
  }

  const teamByPlayerMatch = new Map<string, string>();
  for (const row of mpRows ?? []) {
    teamByPlayerMatch.set(`${row.player_id}__${row.match_id}`, row.team_name);
  }

  const statsByPlayer = new Map<string, FlatPlayerStat[]>();
  for (const s of statsList) {
    if (!statsByPlayer.has(s.player_id)) statsByPlayer.set(s.player_id, []);
    statsByPlayer.get(s.player_id)!.push(s);
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Players</h1>
        <p className="text-sm text-gray-500 mt-0.5">Search by name or mobile, or browse recent players below</p>
      </div>

      <PlayerSearchWidget />

      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider -mb-2">Recent players</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {players.map((p) => {
          const rawStats: RawStat[] = (statsByPlayer.get(p.id) ?? []).map((s) => {
            const m = matchById.get(s.match_id);
            return {
              sport: s.sport,
              runs_scored: s.runs_scored ?? 0,
              wickets_taken: s.wickets_taken ?? 0,
              catches_taken: s.catches_taken ?? 0,
              goals_scored: s.goals_scored ?? 0,
              match_id: s.match_id,
              matches: m
                ? {
                    winner_team_id: m.winner_team_id,
                    winner_team_name: m.winner_team_name,
                    team_a_id: m.team_a_id,
                    team_b_id: m.team_b_id,
                    team_a_name: m.team_a_name,
                    team_b_name: m.team_b_name,
                    confirmation_state: m.confirmation_state,
                  }
                : null,
            };
          });

          const mpForThisPlayer = rawStats.map(s => ({
            match_id: s.match_id,
            team_name: teamByPlayerMatch.get(`${p.id}__${s.match_id}`) ?? '',
          }));
          const enriched = enrichStatsWithTeamNames(
            rawStats,
            mpForThisPlayer,
          );
          const athleteData = buildAthleteData(p, enriched);
          return <AthleteCardMini key={p.id} athlete={athleteData} trustScore={trustScores.get(p.id)} />;
        })}
      </div>
    </div>
  );
}
