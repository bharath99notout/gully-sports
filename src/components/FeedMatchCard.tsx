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

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function CricketScore({ scores, teamA, teamB }: { scores: Score[]; teamA: string; teamB: string }) {
  const sA = scores.find(s => s.team_name === teamA);
  const sB = scores.find(s => s.team_name === teamB);
  return (
    <div className="flex items-center justify-between mt-3">
      <div className="flex-1 text-center">
        <p className="text-xs text-gray-400 truncate mb-0.5">{teamA}</p>
        <p className="text-2xl font-bold text-white">{sA?.runs ?? 0}<span className="text-gray-500 text-lg">/{sA?.wickets ?? 0}</span></p>
        <p className="text-xs text-gray-600">{sA?.overs_faced ?? 0} ov</p>
      </div>
      <div className="text-gray-600 font-bold text-sm px-3">VS</div>
      <div className="flex-1 text-center">
        <p className="text-xs text-gray-400 truncate mb-0.5">{teamB}</p>
        <p className="text-2xl font-bold text-white">{sB?.runs ?? 0}<span className="text-gray-500 text-lg">/{sB?.wickets ?? 0}</span></p>
        <p className="text-xs text-gray-600">{sB?.overs_faced ?? 0} ov</p>
      </div>
    </div>
  );
}

function FootballScore({ scores, teamA, teamB }: { scores: Score[]; teamA: string; teamB: string }) {
  const sA = scores.find(s => s.team_name === teamA);
  const sB = scores.find(s => s.team_name === teamB);
  return (
    <div className="flex items-center justify-between mt-3">
      <div className="flex-1 text-center">
        <p className="text-xs text-gray-400 truncate mb-0.5">{teamA}</p>
        <p className="text-3xl font-bold text-white">{sA?.goals ?? 0}</p>
      </div>
      <div className="text-gray-600 font-bold text-lg px-3">–</div>
      <div className="flex-1 text-center">
        <p className="text-xs text-gray-400 truncate mb-0.5">{teamB}</p>
        <p className="text-3xl font-bold text-white">{sB?.goals ?? 0}</p>
      </div>
    </div>
  );
}

function BadmintonScore({ scores, teamA, teamB }: { scores: Score[]; teamA: string; teamB: string }) {
  const sA = scores.find(s => s.team_name === teamA);
  const sB = scores.find(s => s.team_name === teamB);
  return (
    <div className="flex items-center justify-between mt-3">
      <div className="flex-1 text-center">
        <p className="text-xs text-gray-400 truncate mb-0.5">{teamA}</p>
        <p className="text-lg font-bold text-white">{(sA?.sets as number[] | null)?.join(' · ') ?? '–'}</p>
      </div>
      <div className="text-gray-600 font-bold text-sm px-3">VS</div>
      <div className="flex-1 text-center">
        <p className="text-xs text-gray-400 truncate mb-0.5">{teamB}</p>
        <p className="text-lg font-bold text-white">{(sB?.sets as number[] | null)?.join(' · ') ?? '–'}</p>
      </div>
    </div>
  );
}

export default function FeedMatchCard({ match }: { match: FeedMatch }) {
  const topPerformers = match.player_performances
    .filter(p => p.runs_scored > 0 || p.wickets_taken > 0 || p.goals_scored > 0 || p.catches_taken > 0)
    .slice(0, 3);

  return (
    <Link href={`/matches/${match.id}`}>
      <div className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-4 transition-colors cursor-pointer">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${sportColor[match.sport]}`}>
            {sportEmoji[match.sport]} {match.sport.charAt(0).toUpperCase() + match.sport.slice(1)}
          </span>
          <div className="flex items-center gap-2">
            {match.status === 'live' && (
              <span className="flex items-center gap-1 text-xs text-red-400 font-semibold">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                LIVE
              </span>
            )}
            <span className="text-xs text-gray-600">{timeAgo(match.played_at)}</span>
          </div>
        </div>

        {/* Score */}
        {match.sport === 'cricket' && (
          <CricketScore scores={match.match_scores} teamA={match.team_a_name} teamB={match.team_b_name} />
        )}
        {match.sport === 'football' && (
          <FootballScore scores={match.match_scores} teamA={match.team_a_name} teamB={match.team_b_name} />
        )}
        {match.sport === 'badminton' && (
          <BadmintonScore scores={match.match_scores} teamA={match.team_a_name} teamB={match.team_b_name} />
        )}

        {/* Winner banner */}
        {match.status === 'completed' && match.winner_team_id && (
          <div className="mt-3 text-center">
            <span className="text-xs text-emerald-400 font-semibold">
              🏆 {match.winner_team_id === match.team_a_id ? match.team_a_name : match.team_b_name} won
            </span>
          </div>
        )}

        {/* Player performances */}
        {topPerformers.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-800 flex flex-wrap gap-2">
            {topPerformers.map(p => (
              <Link
                key={p.player_id}
                href={`/players/${p.player_id}`}
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 rounded-full px-2.5 py-1 transition-colors"
              >
                <div className="w-4 h-4 rounded-full bg-emerald-700 flex items-center justify-center text-[9px] font-bold text-white">
                  {p.name[0]}
                </div>
                <span className="text-xs text-white font-medium">{p.name.split(' ')[0]}</span>
                <span className="text-xs text-gray-400">
                  {match.sport === 'cricket' && [
                    p.runs_scored > 0 && `${p.runs_scored}r`,
                    p.wickets_taken > 0 && `${p.wickets_taken}w`,
                    p.catches_taken > 0 && `${p.catches_taken}c`,
                  ].filter(Boolean).join(' ')}
                  {match.sport === 'football' && p.goals_scored > 0 && `${p.goals_scored} goals`}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
