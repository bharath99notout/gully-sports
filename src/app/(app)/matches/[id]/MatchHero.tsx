'use client';

import SportIcon from '@/components/SportIcon';
import { Match, MatchScore } from '@/types';
import { useLiveMatchScores, type LiveScore } from '@/lib/matchLiveBus';

function teamLabel(name: string): string {
  return /^\d+$/.test(name.trim()) ? `Team ${name.trim()}` : name;
}

function sportTint(sport: Match['sport']): { ring: string; bg: string; text: string } {
  switch (sport) {
    case 'cricket':      return { ring: 'ring-blue-500/30',    bg: 'bg-blue-500/10',    text: 'text-blue-300' };
    case 'football':     return { ring: 'ring-green-500/30',   bg: 'bg-green-500/10',   text: 'text-green-300' };
    case 'badminton':    return { ring: 'ring-yellow-500/30',  bg: 'bg-yellow-500/10',  text: 'text-yellow-300' };
    case 'table_tennis': return { ring: 'ring-orange-500/30',  bg: 'bg-orange-500/10',  text: 'text-orange-300' };
    case 'pickleball':   return { ring: 'ring-amber-500/30',   bg: 'bg-amber-500/10',   text: 'text-amber-300' };
    case 'foosball':     return { ring: 'ring-purple-500/30',  bg: 'bg-purple-500/10',  text: 'text-purple-300' };
    default:             return { ring: 'ring-gray-500/30',    bg: 'bg-gray-500/10',    text: 'text-gray-300' };
  }
}

function sportLabel(sport: Match['sport']): string {
  return sport === 'table_tennis' ? 'Table Tennis'
    : sport.charAt(0).toUpperCase() + sport.slice(1);
}

function TeamScore({
  sport, score,
}: {
  sport: Match['sport'];
  score: LiveScore | null;
}) {
  if (sport === 'cricket') {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white tabular-nums">
          {score?.runs ?? 0}
          <span className="text-gray-500">/</span>
          {score?.wickets ?? 0}
        </div>
        <div className="text-[11px] uppercase tracking-wide text-gray-500 tabular-nums">
          {score?.overs_faced ?? 0} ov
        </div>
      </div>
    );
  }
  if (sport === 'football' || sport === 'foosball') {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white tabular-nums">
          {score?.goals ?? 0}
        </div>
        {sport === 'foosball' && (
          <div className="text-[11px] uppercase tracking-wide text-gray-500">games</div>
        )}
      </div>
    );
  }
  // Set-based sports — show set scores horizontally
  const sets = score?.sets ?? [];
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white tabular-nums">
        {sets.length === 0 ? '–' : sets.join(' · ')}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">
        {sets.length === 0 ? 'sets' : sets.length === 1 ? '1 set' : `${sets.length} sets`}
      </div>
    </div>
  );
}

export default function MatchHero({
  match,
  scoreA: initialA,
  scoreB: initialB,
  rightSlot,
}: {
  match: Match;
  scoreA: MatchScore | null;
  scoreB: MatchScore | null;
  rightSlot?: React.ReactNode;
}) {
  // Subscribe to live updates from the sport-specific scorer below.
  // Falls back to the server-rendered initial scores on first render.
  const { scoreA, scoreB } = useLiveMatchScores(match.id, initialA, initialB);
  const tint = sportTint(match.sport);
  const isLive = match.status === 'live';
  const isCompleted = match.status === 'completed';
  const isUpcoming = match.status === 'upcoming';

  const teamA = teamLabel(match.team_a_name);
  const teamB = teamLabel(match.team_b_name);

  const winnerName = match.winner_team_name
    ?? (match.winner_team_id === match.team_a_id ? match.team_a_name
      : match.winner_team_id === match.team_b_id ? match.team_b_name : null);
  const winnerIsA = winnerName && winnerName === match.team_a_name;
  const winnerIsB = winnerName && winnerName === match.team_b_name;

  const format =
    match.sport === 'cricket' && match.cricket_overs ? `${match.cricket_overs} overs`
    : match.sport === 'badminton' && match.badminton_sets ? `Best of ${match.badminton_sets}`
    : match.sport === 'table_tennis' && match.tt_sets ? `Best of ${match.tt_sets}`
    : match.sport === 'pickleball' && match.pickleball_sets ? `Best of ${match.pickleball_sets}`
    : null;

  const playedDate = match.played_at
    ? new Date(match.played_at).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : null;

  return (
    <section className={`relative rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 overflow-hidden`}>
      {/* Status / sport strip */}
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 border-b border-gray-800/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${tint.ring} ${tint.bg} ${tint.text}`}>
            <SportIcon sport={match.sport} className="text-sm leading-none" />
            <span className="uppercase tracking-wide">{sportLabel(match.sport)}</span>
          </span>
          {format && (
            <span className="text-[11px] text-gray-500 truncate">· {format}</span>
          )}
          {playedDate && (
            <span className="hidden sm:inline text-[11px] text-gray-500 truncate">· {playedDate}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isLive && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-red-400 ring-1 ring-red-500/40">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
              Live
            </span>
          )}
          {isCompleted && (
            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 ring-1 ring-gray-700">
              Final
            </span>
          )}
          {isUpcoming && (
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-blue-300 ring-1 ring-blue-500/30">
              Upcoming
            </span>
          )}
          {rightSlot}
        </div>
      </div>

      {/* Score row: Team A · VS · Team B */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-5 sm:py-6">
        <TeamColumn name={teamA} winner={!!winnerIsA}>
          {!isUpcoming && <TeamScore sport={match.sport} score={scoreA} />}
        </TeamColumn>

        <div className="flex flex-col items-center gap-1">
          <span className={`flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full text-lg ${tint.bg} ${tint.text} ring-1 ${tint.ring}`}>
            <SportIcon sport={match.sport} className="text-lg leading-none" />
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-gray-600">vs</span>
        </div>

        <TeamColumn name={teamB} winner={!!winnerIsB}>
          {!isUpcoming && <TeamScore sport={match.sport} score={scoreB} />}
        </TeamColumn>
      </div>

      {/* Winner ribbon */}
      {isCompleted && winnerName && (
        <div className="flex items-center justify-center gap-2 border-t border-emerald-900/40 bg-emerald-500/5 px-4 py-2">
          <span aria-hidden>🏆</span>
          <span className="text-sm font-semibold text-emerald-300">
            {teamLabel(winnerName)} won
          </span>
        </div>
      )}
    </section>
  );
}

function TeamColumn({
  name, winner, children,
}: {
  name: string;
  winner: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-0 text-center">
      <div className="flex items-center gap-1.5 min-w-0 max-w-full">
        {winner && <span aria-hidden className="text-amber-400 text-sm shrink-0">★</span>}
        <h2 className={`text-base sm:text-lg font-bold truncate ${winner ? 'text-white' : 'text-gray-200'}`}>
          {name}
        </h2>
      </div>
      {children}
    </div>
  );
}
