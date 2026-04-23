'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import confetti from 'canvas-confetti';

export interface Achievement {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  color?: 'gold' | 'emerald' | 'red' | 'blue';
}

const DISPLAY_MS = 5000;
const ANIM_MS    = 450;
const MAX_VIEWS  = 1;

const colorMap = {
  gold:    { border: 'border-yellow-700/60', bg: 'from-yellow-950/80 via-amber-950/60 to-yellow-950/80', bar: 'bg-yellow-600/60', text: 'text-yellow-400', confetti: ['#f59e0b', '#fbbf24', '#fde68a', '#fff8dc', '#ffffff'] },
  emerald: { border: 'border-emerald-700/60', bg: 'from-emerald-950/80 via-teal-950/60 to-emerald-950/80', bar: 'bg-emerald-500/60', text: 'text-emerald-400', confetti: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#ffffff'] },
  red:     { border: 'border-red-700/60', bg: 'from-red-950/80 via-rose-950/60 to-red-950/80', bar: 'bg-red-600/60', text: 'text-red-400', confetti: ['#ef4444', '#f87171', '#fca5a5', '#ff6b6b', '#ffffff'] },
  blue:    { border: 'border-blue-700/60', bg: 'from-blue-950/80 via-indigo-950/60 to-blue-950/80', bar: 'bg-blue-500/60', text: 'text-blue-400', confetti: ['#3b82f6', '#60a5fa', '#93c5fd', '#818cf8', '#ffffff'] },
};

export default function TrophyBanner({ achievements }: { achievements: Achievement[] }) {
  const [queue, setQueue]     = useState<Achievement[]>([]);
  const [current, setCurrent] = useState<Achievement | null>(null);
  const [phase, setPhase]     = useState<'enter' | 'exit'>('enter');
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitingRef = useRef(false);

  // Filter achievements that haven't been shown 3 times yet
  useEffect(() => {
    if (!achievements.length) return;
    let counts: Record<string, number> = {};
    try { counts = JSON.parse(localStorage.getItem('gs_ach') ?? '{}'); } catch {}
    const fresh = achievements.filter(a => (counts[a.id] ?? 0) < MAX_VIEWS);
    if (fresh.length) setQueue(fresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When nothing is showing and queue has items, show next
  useEffect(() => {
    if (current !== null || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setPhase('enter');
    exitingRef.current = false;
    setCurrent(next);
  }, [current, queue]);

  // Fire confetti and start auto-dismiss timer whenever current changes
  useEffect(() => {
    if (!current) return;
    const c = colorMap[current.color ?? 'gold'];
    const isGold = !current.color || current.color === 'gold';

    const confettiTimer = setTimeout(() => {
      // Centre burst
      confetti({
        particleCount: isGold ? 160 : 100,
        spread: 110,
        startVelocity: 42,
        origin: { x: 0.5, y: 0.08 },
        colors: c.confetti,
        zIndex: 9999,
      });
      // Side cannons for gold achievements
      if (isGold) {
        confetti({ angle: 55,  spread: 60, particleCount: 70, startVelocity: 50, origin: { x: 0.05, y: 0.2 }, colors: c.confetti, zIndex: 9999 });
        confetti({ angle: 125, spread: 60, particleCount: 70, startVelocity: 50, origin: { x: 0.95, y: 0.2 }, colors: c.confetti, zIndex: 9999 });
      }
    }, 200);

    timerRef.current = setTimeout(startExit, DISPLAY_MS);

    return () => {
      clearTimeout(confettiTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  function startExit() {
    if (exitingRef.current) return;
    exitingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase('exit');
    setTimeout(() => {
      setCurrent(prev => {
        if (prev) {
          try {
            const counts: Record<string, number> = JSON.parse(localStorage.getItem('gs_ach') ?? '{}');
            counts[prev.id] = (counts[prev.id] ?? 0) + 1;
            localStorage.setItem('gs_ach', JSON.stringify(counts));
          } catch {}
        }
        return null;
      });
    }, ANIM_MS);
  }

  if (!current) return null;

  const c = colorMap[current.color ?? 'gold'];
  const animStyle = phase === 'exit'
    ? { animation: `trophy-exit ${ANIM_MS}ms ease-in forwards` }
    : { animation: `trophy-enter ${ANIM_MS}ms cubic-bezier(.34,1.56,.64,1) forwards` };

  return (
    <div style={animStyle}
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-r ${c.border} ${c.bg}`}>

      <div className="flex items-center gap-3 px-4 py-3">
        <div style={{ animation: 'trophy-wiggle 0.8s ease-out 0.35s 1' }}
          className="text-3xl shrink-0 leading-none select-none">
          {current.emoji}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold leading-tight ${c.text}`}>{current.title}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{current.subtitle}</p>
        </div>

        {/* Queue count badge */}
        {queue.length > 0 && (
          <span className="text-xs text-gray-600 shrink-0">+{queue.length} more</span>
        )}

        <button onClick={startExit}
          className="text-gray-600 hover:text-gray-400 transition-colors ml-1 shrink-0">
          <X size={14} />
        </button>
      </div>

      {/* Timer bar — depletes over DISPLAY_MS */}
      {phase !== 'exit' && (
        <div className="h-0.5 bg-gray-800">
          <div className={`h-full origin-left ${c.bar}`}
            style={{ animation: `trophy-bar ${DISPLAY_MS}ms linear forwards` }} />
        </div>
      )}
    </div>
  );
}
