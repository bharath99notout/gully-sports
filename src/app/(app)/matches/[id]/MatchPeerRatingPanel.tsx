'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { rateMatchPlayer } from '@/app/actions/playerTrust';
import type { MatchPlayer } from '@/types';

export default function MatchPeerRatingPanel({
  matchId,
  currentUserId,
  players,
  initialRatings,
}: {
  matchId: string;
  currentUserId: string;
  players: MatchPlayer[];
  initialRatings: Record<string, number>;
}) {
  const [ratings, setRatings] = useState(initialRatings);
  const [busyPlayerId, setBusyPlayerId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const rateablePlayers = players.filter(p => p.player_id !== currentUserId);
  if (rateablePlayers.length === 0) return null;

  function submit(playerId: string, rating: number) {
    setBusyPlayerId(playerId);
    setMessage(null);
    startTransition(async () => {
      const result = await rateMatchPlayer(matchId, playerId, rating);
      if (result.ok) {
        setRatings(prev => ({ ...prev, [playerId]: rating }));
        setMessage('Rating saved');
      } else {
        setMessage(result.error);
      }
      setBusyPlayerId(null);
    });
  }

  return (
    <section className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Rate players</h2>
          <p className="text-[11px] text-gray-500 mt-1">
            Ratings improve Trust Score after confirmed matches. Pick the players who were reliable and good to play with.
          </p>
        </div>
        {message && (
          <span className={`text-[11px] shrink-0 ${message === 'Rating saved' ? 'text-emerald-400' : 'text-red-400'}`}>
            {message}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {rateablePlayers.map(player => {
          const current = ratings[player.player_id] ?? 0;
          const busy = isPending && busyPlayerId === player.player_id;
          return (
            <div
              key={player.player_id}
              className="rounded-xl border border-gray-800 bg-gray-950/45 px-3 py-2.5 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/players/${player.player_id}`}
                  className="text-sm font-semibold text-white hover:text-emerald-300 truncate block"
                >
                  {player.name}
                </Link>
                <p className="text-[11px] text-gray-500 truncate">{player.team_name}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {[1, 2, 3, 4, 5].map(value => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => submit(player.player_id, value)}
                    disabled={busy}
                    aria-label={`Rate ${player.name} ${value} out of 5`}
                    className={`p-1 rounded-md transition-colors disabled:opacity-40 ${
                      value <= current
                        ? 'text-amber-300 hover:text-amber-200'
                        : 'text-gray-700 hover:text-gray-400'
                    }`}
                  >
                    <Star size={17} fill={value <= current ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
