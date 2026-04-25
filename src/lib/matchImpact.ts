import type { MatchScore } from '@/types';
import {
  calcCaliber,
  calcSportPoints,
  getCaliberLabel,
  type PerMatchStat,
  type SportKey,
  type SportStat,
} from './caliber';

export interface MatchPlayerImpactRow {
  player_id: string;
  name: string;
  team_name: string;
  won: boolean;
  /** Career points earned from this match only (same rules as leaderboard). */
  career_points: number;
  /** Caliber formula evaluated as if this were your only match in that sport. */
  caliber_this_match: number;
  caliber_tier: string;
  stat_lines: string[];
  was_mvp: boolean;
}

function resolveWinnerTeamName(match: {
  winner_team_name?: string | null;
  winner_team_id?: string | null;
  team_a_id?: string | null;
  team_b_id?: string | null;
  team_a_name: string;
  team_b_name: string;
}): string | null {
  if (match.winner_team_name) return match.winner_team_name;
  if (match.winner_team_id && match.team_a_id && match.winner_team_id === match.team_a_id) {
    return match.team_a_name;
  }
  if (match.winner_team_id && match.team_b_id && match.winner_team_id === match.team_b_id) {
    return match.team_b_name;
  }
  return null;
}

function teamNameForPlayer(
  playerId: string,
  matchPlayers: Array<{ player_id: string; team_name: string }>,
  teamId: string | null | undefined,
  match: { team_a_id?: string | null; team_b_id?: string | null; team_a_name: string; team_b_name: string },
): string {
  const mp = matchPlayers.find(x => x.player_id === playerId);
  if (mp) return mp.team_name;
  if (teamId && match.team_a_id && teamId === match.team_a_id) return match.team_a_name;
  if (teamId && match.team_b_id && teamId === match.team_b_id) return match.team_b_name;
  return '—';
}

function racquetSetBreakdown(myTeam: string, scores: MatchScore[]): { sets_won: number; clean_sweeps: number } {
  const mine = scores.find(s => s.team_name === myTeam);
  const opp = scores.find(s => s.team_name && s.team_name !== myTeam);
  const my = mine?.sets ?? [];
  const o = opp?.sets ?? [];
  let sets_won = 0;
  let clean_sweeps = 0;
  const len = Math.max(my.length, o.length);
  for (let i = 0; i < len; i++) {
    const a = my[i] ?? 0;
    const b = o[i] ?? 0;
    if (a > b) {
      sets_won += 1;
      if (b === 0 && a > 0) clean_sweeps += 1;
    }
  }
  return { sets_won, clean_sweeps };
}

function cricketImpactScore(runs: number, wkts: number, cat: number): number {
  return runs + wkts * 20 + cat * 10;
}

/**
 * Per-player breakdown for a single match: raw stat lines, career points slice,
 * and a one-match caliber snapshot for transparency.
 */
export function buildMatchPlayerImpactRows(
  sport: SportKey,
  match: {
    winner_team_name?: string | null;
    winner_team_id?: string | null;
    team_a_id?: string | null;
    team_b_id?: string | null;
    team_a_name: string;
    team_b_name: string;
    status?: string;
  },
  matchPlayers: Array<{ player_id: string; team_name: string; name: string }>,
  /** All player_match_stats rows for this match_id */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pmsRows: any[],
  scoreA: MatchScore | null,
  scoreB: MatchScore | null,
): MatchPlayerImpactRow[] {
  const winner = resolveWinnerTeamName(match);
  const scores: MatchScore[] = [scoreA, scoreB].filter(Boolean) as MatchScore[];

  const byPlayer = new Map<string, // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any>();
  for (const row of pmsRows) {
    if (row?.player_id) byPlayer.set(row.player_id, row);
  }

  // Cricket / football: only players with a stat row (avoids phantom +2 pts).
  // Racquet: include roster so set wins still show before rows sync.
  const rosterIds = new Set<string>(
    sport === 'cricket' || sport === 'football'
      ? [...byPlayer.keys()]
      : [...matchPlayers.map(p => p.player_id), ...byPlayer.keys()],
  );

  let mvpIdCricket = '';
  if (sport === 'cricket' && rosterIds.size) {
    let bestSc = -1;
    for (const pid of rosterIds) {
      const row = byPlayer.get(pid);
      const sc = row
        ? cricketImpactScore(row.runs_scored ?? 0, row.wickets_taken ?? 0, row.catches_taken ?? 0)
        : 0;
      if (sc > bestSc) {
        bestSc = sc;
        mvpIdCricket = pid;
      }
    }
    if (bestSc <= 0) mvpIdCricket = '';
  }

  const rows: MatchPlayerImpactRow[] = [];

  for (const pid of rosterIds) {
    const r = byPlayer.get(pid);
    const mp = matchPlayers.find(p => p.player_id === pid);
    const name = mp?.name ?? r?.profiles?.name ?? 'Unknown';
    const team_name = teamNameForPlayer(pid, matchPlayers, r?.team_id, match);
    const won = !!(winner && team_name === winner);

    let stat_lines: string[] = [];
    let pm: PerMatchStat = {
      runs_scored: 0,
      wickets_taken: 0,
      catches_taken: 0,
      goals_scored: 0,
      won,
      was_mvp: false,
    };

    if (sport === 'cricket' && r) {
      const runs = r.runs_scored ?? 0;
      const wk = r.wickets_taken ?? 0;
      const ct = r.catches_taken ?? 0;
      const bf = r.balls_faced ?? 0;
      const fours = r.fours ?? 0;
      const sixes = r.sixes ?? 0;
      const bb = r.balls_bowled ?? 0;
      const rc = r.runs_conceded ?? 0;
      stat_lines = [
        `${runs} runs${bf ? ` (${bf} balls)` : ''}`,
        `${wk} wkts${bb ? ` · ${bb} balls · ${rc} runs conc.` : ''}`,
        `${ct} catches`,
        `${fours} fours · ${sixes} sixes`,
      ];
      pm = {
        runs_scored: runs,
        wickets_taken: wk,
        catches_taken: ct,
        goals_scored: 0,
        won,
        was_mvp: pid === mvpIdCricket && cricketImpactScore(runs, wk, ct) > 0,
      };
    } else if (sport === 'football' && r) {
      const g = r.goals_scored ?? 0;
      stat_lines = [`${g} goals`];
      pm = { runs_scored: 0, wickets_taken: 0, catches_taken: 0, goals_scored: g, won, was_mvp: false };
    } else if (sport === 'badminton' || sport === 'table_tennis') {
      const { sets_won, clean_sweeps } = racquetSetBreakdown(team_name, scores);
      const pts = r?.points_won ?? 0;
      stat_lines = [
        winner ? (won ? 'Match win' : 'Match loss') : 'Result pending',
        `${sets_won} sets won for ${team_name}`,
        clean_sweeps ? `${clean_sweeps} bagel set(s)` : null,
        pts ? `${pts} rally pts (recorded)` : null,
      ].filter(Boolean) as string[];
      pm = {
        runs_scored: 0,
        wickets_taken: 0,
        catches_taken: 0,
        goals_scored: 0,
        won,
        was_mvp: false,
        sets_won,
        clean_sweeps,
      };
    } else if (!r) {
      stat_lines = ['No stat row yet'];
    }

    const career_points = calcSportPoints(sport, [pm]);

    const oneMatchStat: SportStat = {
      matches: 1,
      wins: won ? 1 : 0,
      runs: pm.runs_scored,
      wickets: pm.wickets_taken,
      catches: pm.catches_taken,
      goals: pm.goals_scored,
    };
    const caliber_this_match = calcCaliber(sport, oneMatchStat);
    const caliber_tier = getCaliberLabel(caliber_this_match);

    rows.push({
      player_id: pid,
      name,
      team_name,
      won,
      career_points,
      caliber_this_match,
      caliber_tier,
      stat_lines,
      was_mvp: !!pm.was_mvp,
    });
  }

  // Stable sort: higher career points first, then name
  rows.sort((a, b) => (b.career_points - a.career_points) || a.name.localeCompare(b.name));
  return rows;
}
