import { SportKey, SportStat } from './caliber';
import { AthleteData } from '@/components/AthleteCard';
import { isMatchExcludedFromStats, type ConfirmationState } from './matchConfirmation';

export type RawStat = {
  sport: string;
  runs_scored: number;
  wickets_taken: number;
  catches_taken: number;
  goals_scored: number;
  match_id: string;
  // Extended cricket fields (migration 009). All optional so existing callers
  // that don't request them keep working.
  balls_faced?: number | null;
  fours?: number | null;
  sixes?: number | null;
  balls_bowled?: number | null;
  runs_conceded?: number | null;
  is_out?: boolean | null;
  dismissal?: string | null;
  /** Optional: the team name this player was on in this match (from match_players) */
  my_team_name?: string | null;
  matches: {
    winner_team_id: string | null;
    winner_team_name?: string | null;
    team_a_id: string | null;
    team_b_id: string | null;
    team_a_name?: string | null;
    team_b_name?: string | null;
    /** Trust state from migration 013. Only `confirmed` rows count toward
     *  caliber / leaderboard / detail tiles (Phase 1). */
    confirmation_state?: string | null;
  } | null;
};

// ── Football detail ────────────────────────────────────────────────────────────

export interface FootballDetail {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;            // 0–1
  totalGoals: number;
  goalsPerMatch: number;
  hatTricks: number;          // matches with 3+ goals
  bestMatchGoals: number;     // most goals in a single match
  cleanWins: number;          // wins where the player scored
}

export function emptyFootballDetail(): FootballDetail {
  return {
    matches: 0, wins: 0, losses: 0, draws: 0, winRate: 0,
    totalGoals: 0, goalsPerMatch: 0, hatTricks: 0, bestMatchGoals: 0, cleanWins: 0,
  };
}

function hasResult(r: RawStat): boolean {
  // We only count matches that have a winner recorded — keeps win-rate honest.
  return !!(r.matches?.winner_team_name || r.matches?.winner_team_id);
}

export function buildFootballDetail(rows: RawStat[]): FootballDetail {
  const football = rows.filter(r => r.sport === 'football');
  if (football.length === 0) return emptyFootballDetail();

  // De-dupe per match — multiple stat rows per match would over-count.
  const byMatch = new Map<string, RawStat>();
  for (const r of football) byMatch.set(r.match_id, r);
  const unique = [...byMatch.values()];

  let wins = 0, losses = 0, draws = 0, totalGoals = 0;
  let hatTricks = 0, bestMatchGoals = 0, cleanWins = 0;
  let resulted = 0;

  for (const r of unique) {
    const goals = r.goals_scored ?? 0;
    totalGoals += goals;
    if (goals >= 3) hatTricks += 1;
    if (goals > bestMatchGoals) bestMatchGoals = goals;

    if (hasResult(r)) {
      resulted += 1;
      const won = isWinForPlayer(r);
      if (won) {
        wins += 1;
        if (goals > 0) cleanWins += 1;
      } else if (r.matches?.winner_team_name) {
        // result exists, player didn't win → loss (we don't model draws yet)
        losses += 1;
      }
    }
  }

  const matches = unique.length;
  const winRate = resulted > 0 ? wins / resulted : 0;
  const goalsPerMatch = matches > 0 ? totalGoals / matches : 0;

  return { matches, wins, losses, draws, winRate, totalGoals, goalsPerMatch, hatTricks, bestMatchGoals, cleanWins };
}

// ── Racquet (badminton + table tennis) detail ─────────────────────────────────

/** Per-match set scores for the player's team and the opponent. */
export interface RacquetMatchInput {
  match_id: string;
  /** Did this match have a recorded winner? */
  hasResult: boolean;
  /** True if the player's team is the recorded winner. */
  won: boolean;
  /** Sets the player's team scored, in order. */
  mySets: number[];
  /** Sets the opponent scored, in order. */
  oppSets: number[];
  /** singles = exactly 1 player per side; otherwise doubles. (badminton only) */
  format?: 'singles' | 'doubles';
  /** Played-at timestamp, used for streaks. ISO string. */
  playedAt?: string | null;
}

export interface RacquetDetail {
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  setsWon: number;
  setsLost: number;
  setWinRate: number;        // setsWon / (setsWon + setsLost)
  straightSetWins: number;   // wins without dropping a set
  comebackWins: number;      // wins after losing the first set
  longestWinStreak: number;
  // Optional split (badminton uses this; TT leaves both at 0)
  singlesMatches: number;
  singlesWins: number;
  doublesMatches: number;
  doublesWins: number;
}

export function emptyRacquetDetail(): RacquetDetail {
  return {
    matches: 0, wins: 0, losses: 0, winRate: 0,
    setsWon: 0, setsLost: 0, setWinRate: 0,
    straightSetWins: 0, comebackWins: 0, longestWinStreak: 0,
    singlesMatches: 0, singlesWins: 0, doublesMatches: 0, doublesWins: 0,
  };
}

/**
 * Build the per-match input list for buildRacquetDetail() from raw DB rows.
 * Centralised so /players/[id] and /p/[id] don't reimplement the same joining
 * logic.
 *
 * Inputs:
 *  - rows: player_match_stats rows for this player (already filtered to a sport)
 *  - allMatchPlayers: match_players for THE PLAYER's matches (every player on
 *    every team — needed for singles vs doubles detection AND opponent set
 *    score lookup)
 *  - matchScoresByMatch: map(match_id → list of {team_name, sets})
 *  - playedAtByMatch: map(match_id → ISO timestamp) for streak ordering
 */
export function buildRacquetMatchInputs(
  rows: RawStat[],
  allMatchPlayers: Array<{ match_id: string; player_id: string; team_name: string }>,
  matchScoresByMatch: Map<string, Array<{ team_name: string; sets: number[] | null }>>,
  playedAtByMatch: Map<string, string | null>,
  myPlayerId: string,
  detectFormat = false,
): RacquetMatchInput[] {
  // De-dupe by match
  const seen = new Set<string>();
  const out: RacquetMatchInput[] = [];

  // Pre-build per-match team rosters for format detection
  const rosterByMatch = new Map<string, Map<string, Set<string>>>(); // match → team → playerIds
  if (detectFormat) {
    for (const mp of allMatchPlayers) {
      if (!rosterByMatch.has(mp.match_id)) rosterByMatch.set(mp.match_id, new Map());
      const teams = rosterByMatch.get(mp.match_id)!;
      if (!teams.has(mp.team_name)) teams.set(mp.team_name, new Set());
      teams.get(mp.team_name)!.add(mp.player_id);
    }
  }

  for (const r of rows) {
    if (seen.has(r.match_id)) continue;
    seen.add(r.match_id);

    const myTeam = r.my_team_name
      ?? allMatchPlayers.find(mp => mp.match_id === r.match_id && mp.player_id === myPlayerId)?.team_name
      ?? null;
    if (!myTeam) continue;

    const scores = matchScoresByMatch.get(r.match_id) ?? [];
    const my = scores.find(s => s.team_name === myTeam);
    const opp = scores.find(s => s.team_name !== myTeam);

    const winner = r.matches?.winner_team_name ?? null;
    const hasResult = !!winner;
    const won = !!(winner && winner === myTeam);

    let format: 'singles' | 'doubles' | undefined;
    if (detectFormat) {
      const teams = rosterByMatch.get(r.match_id);
      if (teams && teams.size >= 2) {
        const counts = [...teams.values()].map(s => s.size);
        format = counts.every(c => c === 1) ? 'singles' : 'doubles';
      }
    }

    out.push({
      match_id: r.match_id,
      hasResult,
      won,
      mySets: my?.sets ?? [],
      oppSets: opp?.sets ?? [],
      format,
      playedAt: playedAtByMatch.get(r.match_id) ?? null,
    });
  }

  return out;
}

export function buildRacquetDetail(matches: RacquetMatchInput[]): RacquetDetail {
  if (matches.length === 0) return emptyRacquetDetail();

  let wins = 0, losses = 0, setsWon = 0, setsLost = 0;
  let straightSetWins = 0, comebackWins = 0;
  let singlesMatches = 0, singlesWins = 0, doublesMatches = 0, doublesWins = 0;

  // Streak: walk in chronological order so consecutive wins line up.
  const ordered = [...matches].sort((a, b) => {
    const ta = a.playedAt ? new Date(a.playedAt).getTime() : 0;
    const tb = b.playedAt ? new Date(b.playedAt).getTime() : 0;
    return ta - tb;
  });

  let resulted = 0;
  let curStreak = 0, longestStreak = 0;

  for (const m of ordered) {
    let mySetsWon = 0, oppSetsWon = 0;
    const len = Math.max(m.mySets.length, m.oppSets.length);
    for (let i = 0; i < len; i++) {
      const mine = m.mySets[i] ?? 0;
      const opp  = m.oppSets[i] ?? 0;
      if (mine > opp) mySetsWon += 1;
      else if (opp > mine) oppSetsWon += 1;
    }
    setsWon += mySetsWon;
    setsLost += oppSetsWon;

    if (m.hasResult) {
      resulted += 1;
      if (m.won) {
        wins += 1;
        curStreak += 1;
        if (curStreak > longestStreak) longestStreak = curStreak;
        if (oppSetsWon === 0 && mySetsWon > 0) straightSetWins += 1;
        // Comeback: lost the first played set then went on to win
        if (m.mySets.length > 0 && m.oppSets.length > 0
            && (m.mySets[0] ?? 0) < (m.oppSets[0] ?? 0)) {
          comebackWins += 1;
        }
      } else {
        losses += 1;
        curStreak = 0;
      }
    }

    if (m.format === 'singles') {
      singlesMatches += 1;
      if (m.won) singlesWins += 1;
    } else if (m.format === 'doubles') {
      doublesMatches += 1;
      if (m.won) doublesWins += 1;
    }
  }

  const totalSets = setsWon + setsLost;
  return {
    matches: matches.length,
    wins, losses,
    winRate: resulted > 0 ? wins / resulted : 0,
    setsWon, setsLost,
    setWinRate: totalSets > 0 ? setsWon / totalSets : 0,
    straightSetWins, comebackWins,
    longestWinStreak: longestStreak,
    singlesMatches, singlesWins, doublesMatches, doublesWins,
  };
}

/** Detailed cricket stats derived from per-match rows. */
export interface CricketDetail {
  // Batting
  innings: number;             // matches in which the player batted (balls_faced > 0 OR runs_scored > 0 OR is_out)
  totalRuns: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  centuries: number;           // 100+ in a single innings
  fifties: number;             // 50–99 in a single innings
  ducks: number;               // 0 runs AND out
  notOuts: number;             // batted but not dismissed
  highestScore: number;
  battingAverage: number | null; // runs / dismissals; null if no dismissals
  strikeRate: number | null;     // runs/balls * 100; null if no balls faced
  boundaryPct: number;           // (4s*4 + 6s*6) / runs * 100

  // Bowling
  bowlingInnings: number;      // matches with balls_bowled > 0
  totalWickets: number;
  ballsBowled: number;
  runsConceded: number;
  bestBowling: { wickets: number; runs: number } | null; // best in a single match
  fiveWicketHauls: number;
  threeWicketHauls: number;
  bowlingAverage: number | null; // runs / wickets
  economy: number | null;        // runs / overs (balls_bowled/6)

  // Fielding
  totalCatches: number;
}

export function emptyCricketDetail(): CricketDetail {
  return {
    innings: 0, totalRuns: 0, ballsFaced: 0, fours: 0, sixes: 0,
    centuries: 0, fifties: 0, ducks: 0, notOuts: 0, highestScore: 0,
    battingAverage: null, strikeRate: null, boundaryPct: 0,
    bowlingInnings: 0, totalWickets: 0, ballsBowled: 0, runsConceded: 0,
    bestBowling: null, fiveWicketHauls: 0, threeWicketHauls: 0,
    bowlingAverage: null, economy: null,
    totalCatches: 0,
  };
}

/**
 * Per-match cricket rows aggregate into one CricketDetail.
 * Pure function so it's trivially testable and shareable across server/client.
 */
export function buildCricketDetail(rows: RawStat[]): CricketDetail {
  const cricket = rows.filter(r => r.sport === 'cricket');
  if (cricket.length === 0) return emptyCricketDetail();

  let innings = 0, totalRuns = 0, ballsFaced = 0, fours = 0, sixes = 0;
  let centuries = 0, fifties = 0, ducks = 0, notOuts = 0;
  let highestScore = 0, dismissals = 0;
  let bowlingInnings = 0, totalWickets = 0, ballsBowled = 0, runsConceded = 0;
  let fiveWicketHauls = 0, threeWicketHauls = 0;
  let totalCatches = 0;
  let bestBowling: { wickets: number; runs: number } | null = null;

  for (const r of cricket) {
    const runs = r.runs_scored ?? 0;
    const balls = r.balls_faced ?? 0;
    const out = r.is_out ?? false;
    const wkts = r.wickets_taken ?? 0;
    const conceded = r.runs_conceded ?? 0;
    const bb = r.balls_bowled ?? 0;
    const cts = r.catches_taken ?? 0;

    // Batting innings = batted in this match (faced a ball, scored, or got out).
    const batted = balls > 0 || runs > 0 || out;
    if (batted) {
      innings += 1;
      totalRuns += runs;
      ballsFaced += balls;
      fours += r.fours ?? 0;
      sixes += r.sixes ?? 0;
      if (out) dismissals += 1; else notOuts += 1;
      if (runs >= 100) centuries += 1;
      else if (runs >= 50) fifties += 1;
      if (runs === 0 && out) ducks += 1;
      if (runs > highestScore) highestScore = runs;
    }

    if (bb > 0 || wkts > 0 || conceded > 0) {
      bowlingInnings += 1;
      totalWickets += wkts;
      ballsBowled += bb;
      runsConceded += conceded;
      if (wkts >= 5) fiveWicketHauls += 1;
      else if (wkts >= 3) threeWicketHauls += 1;
      // Best bowling: more wickets first, then fewer runs conceded.
      if (
        wkts > 0 &&
        (!bestBowling
          || wkts > bestBowling.wickets
          || (wkts === bestBowling.wickets && conceded < bestBowling.runs))
      ) {
        bestBowling = { wickets: wkts, runs: conceded };
      }
    }

    totalCatches += cts;
  }

  const battingAverage = dismissals > 0 ? totalRuns / dismissals : null;
  const strikeRate     = ballsFaced > 0 ? (totalRuns / ballsFaced) * 100 : null;
  const boundaryPct    = totalRuns > 0 ? ((fours * 4 + sixes * 6) / totalRuns) * 100 : 0;
  const bowlingAverage = totalWickets > 0 ? runsConceded / totalWickets : null;
  const economy        = ballsBowled > 0 ? runsConceded / (ballsBowled / 6) : null;

  return {
    innings, totalRuns, ballsFaced, fours, sixes,
    centuries, fifties, ducks, notOuts, highestScore,
    battingAverage, strikeRate, boundaryPct,
    bowlingInnings, totalWickets, ballsBowled, runsConceded,
    bestBowling, fiveWicketHauls, threeWicketHauls,
    bowlingAverage, economy,
    totalCatches,
  };
}

function isWinForPlayer(r: RawStat): boolean {
  const m = r.matches;
  if (!m) return false;

  // Preferred path: compare saved winner_team_name with player's team_name in that match
  if (m.winner_team_name && r.my_team_name) {
    return m.winner_team_name === r.my_team_name;
  }

  // Legacy / ID-based: compare winner_team_id with the player's team (requires team IDs)
  if (m.winner_team_id) {
    // We don't know which team the player was on by ID alone, so rely on name match if we have it
    if (r.my_team_name && m.team_a_name && m.team_b_name) {
      const playerSide: 'a' | 'b' | null =
        r.my_team_name === m.team_a_name ? 'a' :
        r.my_team_name === m.team_b_name ? 'b' : null;
      if (playerSide === 'a') return m.winner_team_id === m.team_a_id;
      if (playerSide === 'b') return m.winner_team_id === m.team_b_id;
    }
  }

  return false;
}

export function buildAthleteData(
  profile: { id: string; name: string; avatar_url?: string | null; created_at: string },
  stats: RawStat[]
): AthleteData {
  const sports: SportKey[] = ['cricket', 'football', 'badminton', 'table_tennis'];

  const sportStats = sports.reduce((acc, sport) => {
    const rows = stats.filter(s => s.sport === sport);
    const matchIds = new Set(rows.map(s => s.match_id));
    const wins = rows.filter(isWinForPlayer).length;

    acc[sport] = {
      matches: matchIds.size,
      wins,
      runs:    rows.reduce((s, r) => s + (r.runs_scored    ?? 0), 0),
      wickets: rows.reduce((s, r) => s + (r.wickets_taken  ?? 0), 0),
      catches: rows.reduce((s, r) => s + (r.catches_taken  ?? 0), 0),
      goals:   rows.reduce((s, r) => s + (r.goals_scored   ?? 0), 0),
    };
    return acc;
  }, {} as Record<SportKey, SportStat>);

  return {
    id: profile.id,
    name: profile.name,
    avatarUrl: profile.avatar_url,
    joinedYear: new Date(profile.created_at).getFullYear(),
    sportStats,
  };
}

/**
 * Helper to enrich raw stats with the player's team_name per match.
 * Caller fetches `match_players` rows for the player; this wires them into the stats.
 */
export function enrichStatsWithTeamNames(
  stats: RawStat[],
  matchPlayers: Array<{ match_id: string; team_name: string }>,
): RawStat[] {
  const teamByMatch = new Map<string, string>();
  for (const mp of matchPlayers) teamByMatch.set(mp.match_id, mp.team_name);
  // Phase 1: only fully confirmed matches feed caliber / leaderboard / detail
  // stats. Unconfirmed rows still exist in DB and show on match history with a badge.
  return stats
    .filter(s => !isMatchExcludedFromStats(s.matches?.confirmation_state as ConfirmationState | null | undefined))
    .map(s => ({ ...s, my_team_name: s.my_team_name ?? teamByMatch.get(s.match_id) ?? null }));
}
