export type SportKey = 'cricket' | 'football' | 'badminton';

export interface SportStat {
  matches: number;
  wins: number;
  runs: number;
  wickets: number;
  catches: number;
  goals: number;
}

// ── Caliber score 0–100 ───────────────────────────────────────────────────────
//
// Cricket formula  (weights: batting 45%, bowling 35%, win-rate 20%)
//   perf  = (min(avg,60)/60)*0.45 + (min(wpm,3)/3)*0.35 + winRate*0.20
//   score = round((exp*0.20 + perf*0.80) * 100)   exp = min(1, matches/8)
//
// Football formula (weights: goals/match 60%, win-rate 40%)
//   perf  = (min(gpm,2)/2)*0.60 + winRate*0.40
//
// Badminton: win-rate only
//
// Score bands:
//   0       = Unrated
//   1–24    = Rookie
//   25–49   = Amateur
//   50–69   = Professional
//   70–84   = Expert
//   85–94   = Champion
//   95–100  = Legend

export function calcCaliber(sport: SportKey, s: SportStat): number {
  if (s.matches === 0) return 0;
  const exp = Math.min(1, s.matches / 8);

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
  return Math.min(100, Math.round((exp * 0.2 + (s.wins / s.matches) * 0.8) * 100));
}

export function getCaliberColor(score: number) {
  if (score === 0) return { bar: 'bg-gray-700', text: 'text-gray-600', glow: '' };
  if (score < 25) return { bar: 'bg-blue-700',    text: 'text-blue-400',    glow: 'shadow-blue-900' };
  if (score < 50) return { bar: 'bg-cyan-600',    text: 'text-cyan-400',    glow: 'shadow-cyan-900' };
  if (score < 70) return { bar: 'bg-emerald-600', text: 'text-emerald-400', glow: 'shadow-emerald-900' };
  if (score < 85) return { bar: 'bg-yellow-500',  text: 'text-yellow-400',  glow: 'shadow-yellow-900' };
  if (score < 95) return { bar: 'bg-orange-500',  text: 'text-orange-400',  glow: 'shadow-orange-900' };
  return              { bar: 'bg-red-500',     text: 'text-red-400',     glow: 'shadow-red-900' };
}

export function getCaliberLabel(score: number) {
  if (score === 0)   return 'Unrated';
  if (score < 25)    return 'Rookie';
  if (score < 50)    return 'Amateur';
  if (score < 70)    return 'Professional';
  if (score < 85)    return 'Expert';
  if (score < 95)    return 'Champion';
  return 'Legend';
}

// ── Sport-specific tier names ─────────────────────────────────────────────────
const SPORT_TIER_NAMES: Record<SportKey, string[]> = {
  cricket:   ['Bench Warmer', 'Gully Star',      'Hard Hitter',       'Rohit Sharma Mode', 'Chris Gayle Mode',    'Virat Kohli Mode',    'Sachin Level'],
  football:  ['Bench Warmer', 'Gully Striker',   'Street Footballer', 'Chhetri Mode',      'Neymar Mode',         'Messi Mode',          'Ronaldo Level'],
  badminton: ['Bench Warmer', 'Shuttle Rookie',  'Net Rusher',        'Saina Nehwal Mode', 'PV Sindhu Mode',      'Lee Chong Wei Mode',  'Lin Dan Level'],
};

const SPORT_TIER_EMOJIS: Record<SportKey, string[]> = {
  cricket:   ['🪑', '🌟', '💪', '🏏', '🔥', '👑', '🏆'],
  football:  ['🪑', '⚽', '💨', '🇮🇳', '🎭', '🐐', '🔥'],
  badminton: ['🪑', '🏸', '💨', '⭐', '🏆', '🌟', '👑'],
};

function tierIndex(score: number): number {
  if (score === 0) return 0;
  if (score < 25)  return 1;
  if (score < 50)  return 2;
  if (score < 70)  return 3;
  if (score < 85)  return 4;
  if (score < 95)  return 5;
  return 6;
}

export function getCaliberTierLabel(score: number, activeSports: SportKey[]): string {
  const idx = tierIndex(score);
  if (score === 0 || activeSports.length === 0) return 'Bench Warmer 🪑';
  const parts = activeSports.map(s => `${SPORT_TIER_NAMES[s][idx]} ${SPORT_TIER_EMOJIS[s][idx]}`);
  return parts.join(' · ');
}

// Full tier table for the levels breakdown UI
export interface CaliberTier {
  label: string;          // generic label (Rookie etc.)
  range: string;
  min: number;
  max: number;
  index: number;
  sportNames: Partial<Record<SportKey, string>>;
  sportEmojis: Partial<Record<SportKey, string>>;
}

export const CALIBER_TIERS: CaliberTier[] = [
  { label: 'Bench Warmer', range: '0',      min: 0,  max: 0,   index: 0, sportNames: { cricket: 'Bench Warmer',      football: 'Bench Warmer',       badminton: 'Bench Warmer'       }, sportEmojis: { cricket: '🪑', football: '🪑', badminton: '🪑' } },
  { label: 'Rookie',       range: '1–24',   min: 1,  max: 24,  index: 1, sportNames: { cricket: 'Gully Star',         football: 'Gully Striker',      badminton: 'Shuttle Rookie'     }, sportEmojis: { cricket: '🌟', football: '⚽', badminton: '🏸' } },
  { label: 'Amateur',      range: '25–49',  min: 25, max: 49,  index: 2, sportNames: { cricket: 'Hard Hitter',        football: 'Street Footballer',  badminton: 'Net Rusher'         }, sportEmojis: { cricket: '💪', football: '💨', badminton: '💨' } },
  { label: 'Pro',          range: '50–69',  min: 50, max: 69,  index: 3, sportNames: { cricket: 'Rohit Sharma Mode',  football: 'Chhetri Mode',       badminton: 'Saina Nehwal Mode'  }, sportEmojis: { cricket: '🏏', football: '🇮🇳', badminton: '⭐' } },
  { label: 'Expert',       range: '70–84',  min: 70, max: 84,  index: 4, sportNames: { cricket: 'Chris Gayle Mode',   football: 'Neymar Mode',        badminton: 'PV Sindhu Mode'     }, sportEmojis: { cricket: '🔥', football: '🎭', badminton: '🏆' } },
  { label: 'Champion',     range: '85–94',  min: 85, max: 94,  index: 5, sportNames: { cricket: 'Virat Kohli Mode',   football: 'Messi Mode',         badminton: 'Lee Chong Wei Mode' }, sportEmojis: { cricket: '👑', football: '🐐', badminton: '🌟' } },
  { label: 'Legend',       range: '95–100', min: 95, max: 100, index: 6, sportNames: { cricket: 'Sachin Level',       football: 'Ronaldo Level',      badminton: 'Lin Dan Level'      }, sportEmojis: { cricket: '🏆', football: '🔥', badminton: '👑' } },
];

// ── Personality taglines (replaces "Cricket Batsman" etc.) ───────────────────
//
// Priority: top-tier score first → role-specific personality → tier fallback
// Configurable: edit the strings below to customise labels.

export function getPlayerTagline(sportStats: Record<SportKey, SportStat>): string {
  const active = (['cricket', 'football', 'badminton'] as SportKey[]).filter(
    s => sportStats[s].matches > 0
  );
  if (active.length === 0) return 'New to GullySports';
  if (active.length >= 3)  return 'All-Round Athlete 🏆';
  if (active.length === 2) {
    const icons: Record<SportKey, string> = { cricket: '🏏', football: '⚽', badminton: '🏸' };
    return `${icons[active[0]]}${icons[active[1]]} Multi-Sport Player`;
  }

  const sport = active[0];
  const s     = sportStats[sport];
  const score = calcCaliber(sport, s);

  if (sport === 'cricket') {
    const avg     = s.runs    / s.matches;
    const wpm     = s.wickets / s.matches;
    const winRate = s.wins    / s.matches;

    // Top-tier
    if (score >= 95) return 'Cricket Legend 🏆';
    if (score >= 85) return 'Champion Level ⭐';
    if (score >= 70) return 'Expert Cricketer';

    // Personality — big hitter
    if (avg >= 55) return 'Chris Gayle Mode 🔥';
    if (avg >= 40 && score >= 45) return 'Hard Hitter 💪';

    // Personality — bowler
    if (wpm >= 3)                         return 'Bowling Machine 🎳';
    if (wpm >= 2 && avg < 15)             return 'Pace Destroyer 🎳';
    if (wpm >= 1.5 && avg < 20)           return 'Spin Wizard 🌀';

    // Personality — all-rounder
    if (avg >= 20 && wpm >= 1)            return 'All-Round Threat';

    // Win-rate hero
    if (winRate >= 0.7 && score >= 40)    return 'Match Winner 🏆';

    // Tier fallback
    if (score >= 40) return 'Amateur Cricketer';
    if (score >= 20) return 'Weekend Warrior';
    return 'Rookie Player';
  }

  if (sport === 'football') {
    const gpm     = s.goals / s.matches;
    const winRate = s.wins  / s.matches;

    if (score >= 85)      return 'Professional Level ⚽';
    if (gpm >= 2.5)       return 'Messi Mode 🐐';
    if (gpm >= 1.5)       return 'Goal Machine 🥅';
    if (gpm >= 0.8)       return 'Prolific Scorer ⚽';
    if (winRate >= 0.65)  return 'Match Winner 🏆';
    if (score >= 40)      return 'Amateur Player';
    return 'Football Warrior';
  }

  // badminton
  const winRate = s.wins / s.matches;
  if (score >= 80)      return 'Smash King 🏸';
  if (score >= 60)      return 'Net Commander';
  if (winRate >= 0.6)   return 'Consistent Winner';
  if (score >= 30)      return 'Amateur Shuttler';
  return 'Rally Enthusiast';
}

export function getOverallLevel(sportStats: Record<SportKey, SportStat>): number {
  const scores = (['cricket', 'football', 'badminton'] as SportKey[]).map(
    s => calcCaliber(s, sportStats[s])
  );
  const active = scores.filter(s => s > 0);
  if (active.length === 0) return 0;
  return Math.round(active.reduce((a, b) => a + b, 0) / active.length);
}
