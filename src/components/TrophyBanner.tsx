'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

// canvas-confetti is ~30KB. Lazy-import only when an achievement actually
// fires — most dashboard visits have nothing to celebrate.
type ConfettiFn = (opts: Record<string, unknown>) => void;
let confettiPromise: Promise<ConfettiFn> | null = null;
function loadConfetti(): Promise<ConfettiFn> {
  if (!confettiPromise) {
    confettiPromise = import('canvas-confetti').then(m => m.default as ConfettiFn);
  }
  return confettiPromise;
}

export interface Achievement {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  color?: 'gold' | 'emerald' | 'red' | 'blue';
}

const DISPLAY_MS = 5000;
const ANIM_MS    = 450;
const MAX_VIEWS  = 2;
const LS_KEY     = 'gs_ach';

const colorMap = {
  gold:    { border: 'border-yellow-700/60', bg: 'from-yellow-950/80 via-amber-950/60 to-yellow-950/80', bar: 'bg-yellow-600/60', text: 'text-yellow-400', confetti: ['#f59e0b', '#fbbf24', '#fde68a', '#fff8dc', '#ffffff'] },
  emerald: { border: 'border-emerald-700/60', bg: 'from-emerald-950/80 via-teal-950/60 to-emerald-950/80', bar: 'bg-emerald-500/60', text: 'text-emerald-400', confetti: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#ffffff'] },
  red:     { border: 'border-red-700/60', bg: 'from-red-950/80 via-rose-950/60 to-red-950/80', bar: 'bg-red-600/60', text: 'text-red-400', confetti: ['#ef4444', '#f87171', '#fca5a5', '#ff6b6b', '#ffffff'] },
  blue:    { border: 'border-blue-700/60', bg: 'from-blue-950/80 via-indigo-950/60 to-blue-950/80', bar: 'bg-blue-500/60', text: 'text-blue-400', confetti: ['#3b82f6', '#60a5fa', '#93c5fd', '#818cf8', '#ffffff'] },
};

// Robust read of view counts. Handles legacy array format "['id1','id2']" from
// earlier versions of this component by treating each id as already fully seen.
function readCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const migrated: Record<string, number> = {};
      for (const id of parsed) if (typeof id === 'string') migrated[id] = MAX_VIEWS;
      localStorage.setItem(LS_KEY, JSON.stringify(migrated));
      return migrated;
    }
    if (parsed && typeof parsed === 'object') return parsed as Record<string, number>;
    return {};
  } catch { return {}; }
}

function writeCounts(counts: Record<string, number>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(counts)); } catch {}
}

export default function TrophyBanner({ achievements }: { achievements: Achievement[] }) {
  const [queue, setQueue]     = useState<Achievement[]>([]);
  const [current, setCurrent] = useState<Achievement | null>(null);
  const [phase, setPhase]     = useState<'enter' | 'exit'>('enter');
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitingRef  = useRef(false);
  const initializedRef = useRef(false); // Strict-Mode-safe: only run init once

  // On mount: filter eligible achievements AND immediately persist a view.
  // Incrementing upfront (not on dismiss) means a fast refresh can't replay the
  // badge — once it enters the queue, it counts as a view.
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (!achievements.length) return;

    const counts = readCounts();
    const fresh = achievements.filter(a => (counts[a.id] ?? 0) < MAX_VIEWS);
    if (!fresh.length) return;

    // Mark each queued achievement as viewed right now — even if the user
    // refreshes mid-display, the count is already up-to-date.
    for (const a of fresh) counts[a.id] = (counts[a.id] ?? 0) + 1;
    writeCounts(counts);

    setQueue(fresh);
  }, [achievements]);

  // Pop next from queue when nothing is showing
  useEffect(() => {
    if (current !== null || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setPhase('enter');
    exitingRef.current = false;
    setCurrent(next);
  }, [current, queue]);

  // Confetti + auto-dismiss when current changes
  useEffect(() => {
    if (!current) return;
    const c = colorMap[current.color ?? 'gold'];
    const isGold = !current.color || current.color === 'gold';

    const confettiTimer = setTimeout(async () => {
      const confetti = await loadConfetti();
      confetti({
        particleCount: isGold ? 160 : 100,
        spread: 110,
        startVelocity: 42,
        origin: { x: 0.5, y: 0.08 },
        colors: c.confetti,
        zIndex: 9999,
      });
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
    setTimeout(() => setCurrent(null), ANIM_MS);
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

        {queue.length > 0 && (
          <span className="text-xs text-gray-600 shrink-0">+{queue.length} more</span>
        )}

        <button onClick={startExit}
          className="text-gray-600 hover:text-gray-400 transition-colors ml-1 shrink-0">
          <X size={14} />
        </button>
      </div>

      {phase !== 'exit' && (
        <div className="h-0.5 bg-gray-800">
          <div className={`h-full origin-left ${c.bar}`}
            style={{ animation: `trophy-bar ${DISPLAY_MS}ms linear forwards` }} />
        </div>
      )}
    </div>
  );
}
