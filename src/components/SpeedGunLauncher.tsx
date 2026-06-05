'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Zap, X } from 'lucide-react';
import SpeedGun from './SpeedGun';

/**
 * Client-side launcher for the SpeedGun: renders a trigger (card or icon
 * button) and a modal containing the gun itself. Lets server components
 * embed it without becoming client components themselves.
 *
 * Two trigger variants:
 *   * 'card' — wide tappable card with title + subtitle (used on the
 *     dashboard and the /bowling listing page).
 *   * 'icon' — compact lightning-bolt button (used inline next to the
 *     bowler info in CricketScorer).
 */

export interface SpeedGunLauncherProps {
  variant?: 'card' | 'icon';
  /** Optional live-match context — passed straight through to SpeedGun. */
  matchId?: string | null;
  overIndex?: number | null;
  /** Override the card's title/subtitle copy if you want. */
  title?: string;
  subtitle?: string;
}

export default function SpeedGunLauncher({
  variant = 'card',
  matchId = null,
  overIndex = null,
  title    = 'Bowling speed gun',
  subtitle = 'Two taps. Release → bounce. See your km/h.',
}: SpeedGunLauncherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === 'card' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-between gap-3 rounded-2xl border border-amber-900/50 bg-amber-950/15 hover:bg-amber-950/30 hover:border-amber-700 px-4 py-3 transition-colors text-left"
        >
          <div className="min-w-0 flex items-center gap-3">
            <span className="h-9 w-9 rounded-full bg-amber-500/15 ring-1 ring-amber-500/40 flex items-center justify-center shrink-0">
              <Zap size={16} className="text-amber-300" fill="currentColor" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-200">{title}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>
            </div>
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-300 shrink-0">
            Open →
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 ring-1 ring-amber-500/40 text-amber-200 px-3 py-1.5 text-xs font-bold hover:bg-amber-500/25"
        >
          <Zap size={12} fill="currentColor" /> Speed
        </button>
      )}

      {open && (
        <SpeedGunModal
          matchId={matchId}
          overIndex={overIndex}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function SpeedGunModal({
  matchId, overIndex, onClose, onSaved,
}: {
  matchId: string | null;
  overIndex: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-gray-950/70 backdrop-blur-sm p-3"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl border border-gray-800 bg-gray-950 shadow-2xl p-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-white inline-flex items-center gap-1.5">
            <Zap size={14} className="text-amber-300" fill="currentColor" />
            Speed gun
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-500 hover:text-gray-200 p-1"
          >
            <X size={16} />
          </button>
        </div>
        <SpeedGun
          matchId={matchId}
          overIndex={overIndex}
          onSaved={onSaved}
          onCancel={onClose}
          showCancel={false}
        />
      </div>
    </div>
  );
}
