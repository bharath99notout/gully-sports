'use client';

import Link from 'next/link';
import { SportType, MatchStatus } from '@/types';

interface PlayerPerf {
  player_id: string;
  name: string;
  runs_scored: number;
  wickets_taken: number;
  catches_taken: number;
  goals_scored: number;
}

interface Score {
  team_name: string;
  runs: number;
  wickets: number;
  overs_faced: number;
  goals: number;
  sets: number[] | null;
}

interface FeedMatch {
  id: string;
  sport: SportType;
  status: MatchStatus;
  team_a_name: string;
  team_b_name: string;
  winner_team_id: string | null;
  winner_team_name?: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  played_at: string;
  match_scores: Score[];
  player_performances: PlayerPerf[];
}

const sportEmoji: Record<SportType, string> = { cricket: '🏏', football: '⚽', badminton: '🏸' };
const sportColor: Record<SportType, string> = {
  cricket: 'text-blue-400 bg-blue-950/60 border-blue-900',
  football: 'text-green-400 bg-green-950/60 border-green-900',
  badminton: 'text-yellow-400 bg-yellow-950/60 border-yellow-900',
};

function teamLabel(name: string): string {
  return /^\d+$/.test(name.trim()) ? `Team ${name.trim()}` : name;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function impactScore(p: PlayerPerf): number {
  return (p.runs_scored ?? 0) + 20 * (p.wickets_taken ?? 0) + 10 * (p.catches_taken ?? 0) + 25 * (p.goals_scored ?? 0);
}

// ── Team row (stacked, IPL-style) ─────────────────────────────────────────────

function TeamRow({ name, score, sport, isWinner, dim }: {
  name: string;
  score: Score | undefined;
  sport: SportType;
  isWinner: boolean;
  dim: boolean;
}) {
  const display = teamLabel(name);
  const nameCol = dim ? 'text-gray-500' : isWinner ? 'text-white' : 'text-gray-300';
  const scoreCol = dim ? 'text-gray-600' : 'text-white';

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2 min-w-0">
        {/* Logo circle */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 border ${
          isWinner ? 'bg-emerald-900/60 border-emerald-700 text-emerald-200' : 'bg-gray-800 border-gray-700 text-gray-400'
        }`}>
          {display.replace(/^Team\s+/, '').slice(0, 3).toUpperCase()}
        </div>
        <span className={`text-sm font-bold truncate ${nameCol}`}>{display}</span>
        {isWinner && <span className="text-[9px] bg-emerald-800/60 text-emerald-300 px-1.5 py-0.5 rounded font-bold shrink-0">WON</span>}
      </div>

      <div className={`text-right shrink-0 ${scoreCol}`}>
        {sport === 'cricket' && (
          <>
            <span className="text-lg font-black tabular-nums">{score?.runs ?? 0}</span>
            <span className="text-sm text-gray-500">/{score?.wickets ?? 0}</span>
            <span className="text-xs text-gray-600 ml-1.5 tabular-nums">({score?.overs_faced ?? 0})</span>
          </>
        )}
        {sport === 'football' && (
          <span className="text-xl font-black tabular-nums">{score?.goals ?? 0}</span>
        )}
        {sport === 'badminton' && (
          <span className="text-sm font-bold tabular-nums">{(score?.sets as number[] | null)?.join(' · ') ?? '–'}</span>
        )}
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

export default function FeedMatchCard({ match }: { match: FeedMatch }) {
  const sA = match.match_scores.find(s => s.team_name === match.team_a_name);
  const sB = match.match_scores.find(s => s.team_name === match.team_b_name);

  // Determine winner (tolerates ad-hoc matches w/ no team IDs)
  let winner: 'a' | 'b' | null = null;
  const wn = match.winner_team_name;
  if (wn === match.team_a_name) winner = 'a';
  else if (wn === match.team_b_name) winner = 'b';
  else if (match.winner_team_id) {
    if (match.winner_team_id === match.team_a_id) winner = 'a';
    else if (match.winner_team_id === match.team_b_id) winner = 'b';
  }
  // Score-based fallback if match completed but no winner stored
  if (!winner && match.status === 'completed' && match.sport === 'cricket') {
    const runsA = sA?.runs ?? 0, runsB = sB?.runs ?? 0;
    if (runsA !== runsB) winner = runsA > runsB ? 'a' : 'b';
  }

  // Build result line ("X won by Y runs/wkts")
  let resultLine = '';
  if (match.status === 'completed') {
    if (winner && match.sport === 'cricket') {
      const runsA = sA?.runs ?? 0, runsB = sB?.runs ?? 0;
      const wktsA = sA?.wickets ?? 0, wktsB = sB?.wickets ?? 0;
      const winnerName = teamLabel(winner === 'a' ? match.team_a_name : match.team_b_name);
      if (winner === 'a') {
        resultLine = runsA > runsB ? `${winnerName} won by ${runsA - runsB} runs` : `${winnerName} won by ${Math.max(0, 10 - wktsA)} wkts`;
      } else {
        resultLine = runsB > runsA ? `${winnerName} won by ${runsB - runsA} runs` : `${winnerName} won by ${Math.max(0, 10 - wktsB)} wkts`;
      }
    } else if (winner) {
      const winnerName = teamLabel(winner === 'a' ? match.team_a_name : match.team_b_name);
      resultLine = `${winnerName} won`;
    } else {
      resultLine = 'Match ended — no result';
    }
  }

  // Player of the Match (highest impact across both teams)
  const pom = match.player_performances
    .filter(p => impactScore(p) > 0)
    .sort((a, b) => impactScore(b) - impactScore(a))[0];

  return (
    <Link href={`/matches/${match.id}`}>
      <div className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl overflow-hidden transition-colors cursor-pointer">

        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-800/30">
          <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${sportColor[match.sport]}`}>
            {sportEmoji[match.sport]} {match.sport.charAt(0).toUpperCase() + match.sport.slice(1)}
          </span>
          <div className="flex items-center gap-2">
            {match.status === 'live' && (
              <span className="flex items-center gap-1 text-[11px] text-red-400 font-bold">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                LIVE
              </span>
            )}
            {match.status === 'completed' && (
              <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Completed</span>
            )}
            <span className="text-[11px] text-gray-600">· {timeAgo(match.played_at)}</span>
          </div>
        </div>

        {/* Team rows (stacked, IPL-style) */}
        <div className="px-4 divide-y divide-gray-800/60">
          <TeamRow name={match.team_a_name} score={sA} sport={match.sport}
            isWinner={winner === 'a'} dim={match.status === 'completed' && winner === 'b'} />
          <TeamRow name={match.team_b_name} score={sB} sport={match.sport}
            isWinner={winner === 'b'} dim={match.status === 'completed' && winner === 'a'} />
        </div>

        {/* Result line */}
        {resultLine && (
          <div className={`px-4 py-2 border-t border-gray-800 ${winner ? 'bg-emerald-950/20' : 'bg-gray-800/20'}`}>
            <p className={`text-xs font-semibold ${winner ? 'text-emerald-300' : 'text-gray-400'}`}>
              {winner && '🏆 '}{resultLine}
            </p>
          </div>
        )}

        {/* Player of the Match */}
        {pom && match.status === 'completed' && (
          <Link
            href={`/players/${pom.player_id}`}
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-2.5 px-4 py-2.5 border-t border-gray-800 hover:bg-gray-800/40 transition-colors">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-yellow-600 to-amber-700 flex items-center justify-center text-xs font-bold text-white border border-yellow-900/60 shrink-0">
              {pom.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-yellow-500 font-bold uppercase tracking-widest leading-none">Player of the Match</p>
              <p className="text-xs text-white font-semibold mt-0.5 truncate">
                {pom.name}
                <span className="text-gray-500 font-normal ml-1.5">
                  {match.sport === 'cricket' && [
                    pom.runs_scored > 0 && `${pom.runs_scored}r`,
                    pom.wickets_taken > 0 && `${pom.wickets_taken}w`,
                    pom.catches_taken > 0 && `${pom.catches_taken}c`,
                  ].filter(Boolean).join(' · ')}
                  {match.sport === 'football' && pom.goals_scored > 0 && `${pom.goals_scored} goals`}
                </span>
              </p>
            </div>
          </Link>
        )}
      </div>
    </Link>
  );
}
