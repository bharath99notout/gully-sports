export type SportKey = 'cricket' | 'football' | 'badminton';

export interface SportStat {
  matches: number;
  wins: number;
  runs: number;
  wickets: number;
  catches: number;
  goals: number;
}

// Returns 0–100 caliber score for a sport
export function calcCaliber(sport: SportKey, s: SportStat): number {
  if (s.matches === 0) return 0;
  const exp = Math.min(1, s.matches / 8); // full experience at 8 matches

  if (sport === 'cricket') {
    const avg = s.runs / s.matches;
    const wpm = s.wickets / s.matches;
    const winRate = s.wins / s.matches;
    const perf = (Math.min(avg, 60) / 60) * 0.45 + (Math.min(wpm, 3) / 3) * 0.35 + winRate * 0.2;
    return Math.min(100, Math.round((exp * 0.2 + perf * 0.8) * 100));
  }
  if (sport === 'football') {
    const gpm = s.goals / s.matches;
    const winRate = s.wins / s.matches;
    const perf = (Math.min(gpm, 2) / 2) * 0.6 + winRate * 0.4;
    return Math.min(100, Math.round((exp * 0.2 + perf * 0.8) * 100));
  }
  // badminton — win rate is king
  return Math.min(100, Math.round((exp * 0.2 + (s.wins / s.matches) * 0.8) * 100));
}

export function getCaliberColor(score: number) {
  if (score === 0) return { bar: 'bg-gray-700', text: 'text-gray-600', glow: '' };
  if (score < 25) return { bar: 'bg-blue-700', text: 'text-blue-400', glow: 'shadow-blue-900' };
  if (score < 50) return { bar: 'bg-cyan-600', text: 'text-cyan-400', glow: 'shadow-cyan-900' };
  if (score < 70) return { bar: 'bg-emerald-600', text: 'text-emerald-400', glow: 'shadow-emerald-900' };
  if (score < 85) return { bar: 'bg-yellow-500', text: 'text-yellow-400', glow: 'shadow-yellow-900' };
  return { bar: 'bg-orange-500', text: 'text-orange-400', glow: 'shadow-orange-900' };
}

export function getCaliberLabel(score: number) {
  if (score === 0) return 'Unrated';
  if (score < 25) return 'Rookie';
  if (score < 50) return 'Amateur';
  if (score < 70) return 'Club';
  if (score < 85) return 'District';
  if (score < 95) return 'State';
  return 'Elite';
}

export function getPlayerTagline(sportStats: Record<SportKey, SportStat>): string {
  const active = (['cricket', 'football', 'badminton'] as SportKey[]).filter(s => sportStats[s].matches > 0);
  if (active.length === 0) return 'New to GullySports';
  if (active.length >= 3) return 'All-Round Athlete';
  if (active.length === 2) {
    const labels: Record<SportKey, string> = { cricket: 'Cricket', football: 'Football', badminton: 'Badminton' };
    return `${labels[active[0]]} & ${labels[active[1]]} Player`;
  }
  const s = active[0];
  if (s === 'cricket') {
    const { runs, wickets, matches } = sportStats.cricket;
    if (wickets / matches > runs / matches / 12) return 'Cricket Bowler';
    if (runs / matches > 30) return 'Cricket Batsman';
    return 'Cricket Player';
  }
  if (s === 'football') {
    return sportStats.football.goals / sportStats.football.matches > 1 ? 'Goal Machine' : 'Football Player';
  }
  return 'Badminton Player';
}

export function getOverallLevel(sportStats: Record<SportKey, SportStat>): number {
  const scores = (['cricket', 'football', 'badminton'] as SportKey[]).map(s => calcCaliber(s, sportStats[s]));
  const active = scores.filter(s => s > 0);
  if (active.length === 0) return 0;
  return Math.round(active.reduce((a, b) => a + b, 0) / active.length);
}
