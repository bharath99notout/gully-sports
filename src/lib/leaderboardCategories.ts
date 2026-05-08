// Pure data + helpers for sport-specific leaderboard category configs.
// Safe to import from both server and client components.

import type { PlayerAggregate } from './tournament';

export type LeaderboardCategory = {
  key: string;
  label: string;
  /** column headers — first is always rank, second is always Player. */
  cols: { key: string; label: string; align?: 'left' | 'right' }[];
  /** filter: only show players who recorded any activity for this discipline. */
  filter: (a: PlayerAggregate) => boolean;
  /** primary sort metric (descending). */
  sortBy: (a: PlayerAggregate) => number;
  /** column value renderer for an aggregate. */
  cell: (a: PlayerAggregate, key: string) => string;
};

const fmt1 = (n: number) => n.toFixed(1);
const fmt2 = (n: number) => n.toFixed(2);
function strikeRate(runs: number, balls: number) {
  return balls > 0 ? fmt1((runs / balls) * 100) : '–';
}
function economy(runsConceded: number, balls: number) {
  return balls > 0 ? fmt2((runsConceded / balls) * 6) : '–';
}
function ballsToOversStr(balls: number) {
  if (balls <= 0) return '–';
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

const CRICKET_BATTING: LeaderboardCategory = {
  key: 'batting',
  label: 'Batting',
  cols: [
    { key: 'M',  label: 'M',  align: 'right' },
    { key: 'R',  label: 'R',  align: 'right' },
    { key: 'HS', label: 'HS', align: 'right' },
    { key: 'SR', label: 'SR', align: 'right' },
  ],
  filter: a => a.total_runs > 0 || a.total_balls_faced > 0,
  sortBy: a => a.total_runs,
  cell: (a, k) => {
    if (k === 'M')  return String(a.matches_played);
    if (k === 'R')  return String(a.total_runs);
    if (k === 'HS') return String(a.highest_score);
    if (k === 'SR') return strikeRate(a.total_runs, a.total_balls_faced);
    return '';
  },
};

const CRICKET_BOWLING: LeaderboardCategory = {
  key: 'bowling',
  label: 'Bowling',
  cols: [
    { key: 'M',    label: 'M',    align: 'right' },
    { key: 'O',    label: 'O',    align: 'right' },
    { key: 'RC',   label: 'R',    align: 'right' },
    { key: 'W',    label: 'W',    align: 'right' },
    { key: 'Econ', label: 'Econ', align: 'right' },
  ],
  filter: a => a.total_wickets > 0 || a.total_balls_bowled > 0,
  sortBy: a => a.total_wickets * 1000 + a.total_balls_bowled / 1000,
  cell: (a, k) => {
    if (k === 'M')    return String(a.matches_played);
    if (k === 'O')    return ballsToOversStr(a.total_balls_bowled);
    if (k === 'RC')   return String(a.total_runs_conceded);
    if (k === 'W')    return String(a.total_wickets);
    if (k === 'Econ') return economy(a.total_runs_conceded, a.total_balls_bowled);
    return '';
  },
};

const CRICKET_FIELDING: LeaderboardCategory = {
  key: 'fielding',
  label: 'Fielding',
  cols: [
    { key: 'M', label: 'M',       align: 'right' },
    { key: 'C', label: 'Catches', align: 'right' },
  ],
  filter: a => a.total_catches > 0,
  sortBy: a => a.total_catches,
  cell: (a, k) => {
    if (k === 'M') return String(a.matches_played);
    if (k === 'C') return String(a.total_catches);
    return '';
  },
};

const FOOTBALL_GOALS: LeaderboardCategory = {
  key: 'goals',
  label: 'Top Scorers',
  cols: [
    { key: 'M', label: 'M',     align: 'right' },
    { key: 'G', label: 'Goals', align: 'right' },
  ],
  filter: a => a.total_goals > 0,
  sortBy: a => a.total_goals,
  cell: (a, k) => {
    if (k === 'M') return String(a.matches_played);
    if (k === 'G') return String(a.total_goals);
    return '';
  },
};

const FOOTBALL_WINS: LeaderboardCategory = {
  key: 'wins',
  label: 'Most Wins',
  cols: [
    { key: 'M', label: 'M',    align: 'right' },
    { key: 'W', label: 'Wins', align: 'right' },
  ],
  filter: a => a.wins > 0,
  sortBy: a => a.wins,
  cell: (a, k) => {
    if (k === 'M') return String(a.matches_played);
    if (k === 'W') return String(a.wins);
    return '';
  },
};

export function categoriesForSport(sport: string): LeaderboardCategory[] {
  switch (sport) {
    case 'cricket':  return [CRICKET_BATTING, CRICKET_BOWLING, CRICKET_FIELDING];
    case 'football': return [FOOTBALL_GOALS, FOOTBALL_WINS];
    // Set-based sports (badminton / table_tennis / foosball) fall through to
    // the single-metric "Most Wins" card layout — no per-discipline split.
    default:         return [];
  }
}
