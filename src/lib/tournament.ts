import type { SportType } from '@/types';

/**
 * Tournament Phase 1 — auto-computed leaderboards + MOP per sport.
 *
 * All inputs come from joining `player_match_stats` × `matches` × `profiles`,
 * filtered to a single `tournament_id`. We pass the joined rows in here so this
 * module stays pure and testable.
 */

export type RawTournamentStat = {
  player_id: string;
  player_name: string;
  match_id: string;
  team_name: string;
  runs_scored: number;
  wickets_taken: number;
  catches_taken: number;
  goals_scored: number;
  points_won: number;
  match_winner_team_name: string | null;
};

export type LeaderboardEntry = {
  player_id: string;
  player_name: string;
  value: number;
  display: string;
};

export type Award = {
  award_type: string;
  label: string;
  player_id: string;
  player_name: string;
  display_value: string;
};

// ── Per-player aggregation ──────────────────────────────────────────────────

export type PlayerAggregate = {
  player_id: string;
  player_name: string;
  matches_played: number;
  wins: number;
  total_runs: number;
  total_wickets: number;
  total_catches: number;
  total_goals: number;
  total_points: number;
  // MOP impact score per sport (computed below)
  impact: number;
};

export function aggregatePlayers(
  rows: RawTournamentStat[],
  sport: SportType,
): PlayerAggregate[] {
  const map = new Map<string, PlayerAggregate>();
  const matchSeen = new Map<string, Set<string>>(); // player_id → set of match_ids (for matches_played)

  for (const r of rows) {
    let agg = map.get(r.player_id);
    if (!agg) {
      agg = {
        player_id: r.player_id,
        player_name: r.player_name,
        matches_played: 0,
        wins: 0,
        total_runs: 0,
        total_wickets: 0,
        total_catches: 0,
        total_goals: 0,
        total_points: 0,
        impact: 0,
      };
      map.set(r.player_id, agg);
      matchSeen.set(r.player_id, new Set());
    }
    const seen = matchSeen.get(r.player_id)!;
    if (!seen.has(r.match_id)) {
      seen.add(r.match_id);
      agg.matches_played += 1;
      if (r.match_winner_team_name && r.match_winner_team_name === r.team_name) {
        agg.wins += 1;
      }
    }
    agg.total_runs += r.runs_scored ?? 0;
    agg.total_wickets += r.wickets_taken ?? 0;
    agg.total_catches += r.catches_taken ?? 0;
    agg.total_goals += r.goals_scored ?? 0;
    agg.total_points += r.points_won ?? 0;
  }

  // Compute MOP impact per sport
  for (const agg of map.values()) {
    agg.impact = computeImpact(agg, sport);
  }

  return [...map.values()];
}

function computeImpact(p: PlayerAggregate, sport: SportType): number {
  switch (sport) {
    case 'cricket':
      return p.total_runs + 20 * p.total_wickets + 10 * p.total_catches;
    case 'football':
      return 5 * p.total_goals;
    case 'badminton':
    case 'table_tennis':
      return p.wins;
    default:
      return 0;
  }
}

// ── Leaderboards (sorted views of aggregates) ───────────────────────────────

function topByMetric(
  aggs: PlayerAggregate[],
  metric: keyof PlayerAggregate,
  unit: string,
  limit = 10,
): LeaderboardEntry[] {
  return aggs
    .filter(a => Number(a[metric]) > 0)
    .sort((a, b) => Number(b[metric]) - Number(a[metric]))
    .slice(0, limit)
    .map(a => ({
      player_id: a.player_id,
      player_name: a.player_name,
      value: Number(a[metric]),
      display: `${a[metric]} ${unit}`,
    }));
}

export type Leaderboards = {
  primary: { key: string; label: string; entries: LeaderboardEntry[] }[];
};

export function leaderboardsFor(
  aggs: PlayerAggregate[],
  sport: SportType,
): Leaderboards {
  switch (sport) {
    case 'cricket':
      return {
        primary: [
          { key: 'top_run_scorer',   label: 'Top Run Scorer',  entries: topByMetric(aggs, 'total_runs', 'runs') },
          { key: 'top_wicket_taker', label: 'Top Wicket Taker', entries: topByMetric(aggs, 'total_wickets', 'wkts') },
          { key: 'most_catches',     label: 'Most Catches',     entries: topByMetric(aggs, 'total_catches', 'catches') },
        ],
      };
    case 'football':
      return {
        primary: [
          { key: 'top_scorer_football', label: 'Top Scorer', entries: topByMetric(aggs, 'total_goals', 'goals') },
          { key: 'most_wins',           label: 'Most Wins',  entries: topByMetric(aggs, 'wins', 'wins') },
        ],
      };
    case 'badminton':
    case 'table_tennis':
      return {
        primary: [
          { key: 'most_wins', label: 'Most Wins', entries: topByMetric(aggs, 'wins', 'wins') },
        ],
      };
    default:
      return { primary: [] };
  }
}

// ── MOP (Player of the Tournament) ─────────────────────────────────────────

export function mopOf(aggs: PlayerAggregate[]): PlayerAggregate | null {
  if (aggs.length === 0) return null;
  const sorted = [...aggs].sort((a, b) => b.impact - a.impact);
  return sorted[0].impact > 0 ? sorted[0] : null;
}

// ── Award snapshot for "End Tournament" ────────────────────────────────────

export function awardsSnapshot(
  aggs: PlayerAggregate[],
  sport: SportType,
): Array<{ award_type: string; player_id: string; display_value: string }> {
  const out: Array<{ award_type: string; player_id: string; display_value: string }> = [];
  const lbs = leaderboardsFor(aggs, sport);
  for (const lb of lbs.primary) {
    const top = lb.entries[0];
    if (top) {
      out.push({
        award_type: lb.key,
        player_id: top.player_id,
        display_value: top.display,
      });
    }
  }
  const mop = mopOf(aggs);
  if (mop) {
    out.push({
      award_type: 'mop',
      player_id: mop.player_id,
      display_value: mopDisplayFor(mop, sport),
    });
  }
  return out;
}

function mopDisplayFor(p: PlayerAggregate, sport: SportType): string {
  switch (sport) {
    case 'cricket':
      return `${p.total_runs} runs · ${p.total_wickets} wkts · ${p.total_catches} catches`;
    case 'football':
      return `${p.total_goals} goals · ${p.wins} wins`;
    case 'badminton':
    case 'table_tennis':
      return `${p.wins} wins from ${p.matches_played} matches`;
    default:
      return '';
  }
}

// ── Standings (league points table) ─────────────────────────────────────────

export type StandingRow = {
  team_id: string | null;
  team_name: string;
  played: number;
  won: number;
  lost: number;
  points: number;
};

export type RawMatchForStandings = {
  team_a_id: string | null;
  team_a_name: string;
  team_b_id: string | null;
  team_b_name: string;
  winner_team_id: string | null;
  winner_team_name: string | null;
  status: string;
};

/** Simple 2-1-0 (win-tie-loss) league standings; ties = no winner_team_name. */
export function computeStandings(matches: RawMatchForStandings[]): StandingRow[] {
  const map = new Map<string, StandingRow>();

  function ensure(teamId: string | null, teamName: string) {
    const key = teamId ?? `name:${teamName}`;
    let row = map.get(key);
    if (!row) {
      row = { team_id: teamId, team_name: teamName, played: 0, won: 0, lost: 0, points: 0 };
      map.set(key, row);
    }
    return row;
  }

  for (const m of matches) {
    if (m.status !== 'completed') continue;
    const a = ensure(m.team_a_id, m.team_a_name);
    const b = ensure(m.team_b_id, m.team_b_name);
    a.played += 1;
    b.played += 1;
    if (!m.winner_team_name) {
      // Tie
      a.points += 1;
      b.points += 1;
    } else if (m.winner_team_name === m.team_a_name) {
      a.won += 1;
      a.points += 2;
      b.lost += 1;
    } else if (m.winner_team_name === m.team_b_name) {
      b.won += 1;
      b.points += 2;
      a.lost += 1;
    }
  }

  return [...map.values()].sort((x, y) => y.points - x.points || y.won - x.won);
}

// ── Award labels for UI ─────────────────────────────────────────────────────

export const AWARD_LABELS: Record<string, string> = {
  mop:                  'Player of the Tournament',
  top_run_scorer:       'Top Run Scorer',
  top_wicket_taker:     'Top Wicket Taker',
  most_catches:         'Most Catches',
  top_scorer_football:  'Top Scorer',
  most_wins:            'Most Wins',
};
