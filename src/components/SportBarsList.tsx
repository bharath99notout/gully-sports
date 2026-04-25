'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import CaliberBar from './CaliberBar';
import {
  calcCaliber, getCaliberColor, type SportKey, type SportStat,
} from '@/lib/caliber';

export interface SportBarRow {
  key: SportKey;
  emoji: string;
  label: string;
  /** Right-aligned 1-line summary, e.g. "138 runs · avg 34.5 · 3 wkts". */
  statSummary: string;
  /** Optional expanded panel revealed when "More ▾" is tapped. */
  details?: ReactNode;
}

interface Props {
  rows: SportBarRow[];
  sportStats: Record<SportKey, SportStat>;
  /** When true, sport bars are interactive (More ▾ toggles details inline). */
  interactive?: boolean;
  /** Sport open by default in interactive mode. */
  defaultOpen?: SportKey | null;
  compact?: boolean;
}

/**
 * The "sport caliber bars" list inside AthleteCard, extracted so we can give
 * it client-side toggle state without making the whole card a client
 * component.
 *
 * - Non-interactive (dashboard): renders exactly like the original — emoji +
 *   bar + right-aligned 1-line stats. No chevron, no details.
 * - Interactive (profile pages): each row gains a "More ▾" chevron. Tapping
 *   reveals the `details` slot inline below that row. Only one row open at a
 *   time so the card never explodes.
 */
export default function SportBarsList({
  rows, sportStats, interactive = false, defaultOpen = null, compact = false,
}: Props) {
  const [open, setOpen] = useState<SportKey | null>(defaultOpen);

  return (
    <div className={`flex flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
      {rows.map(row => {
        const score = calcCaliber(row.key, sportStats[row.key]);
        const { text } = getCaliberColor(score);
        const hasMatches = sportStats[row.key].matches > 0;
        const canExpand = interactive && hasMatches && !!row.details;
        const isOpen = open === row.key;

        const headerInner = (
          <>
            <span className={`text-xs font-semibold ${hasMatches ? 'text-white' : 'text-gray-700'}`}>
              {row.emoji} {row.label}
            </span>
            <div className="flex items-center gap-1.5">
              {!compact && hasMatches && (
                <span className={`text-xs ${text}`}>{row.statSummary}</span>
              )}
              {canExpand && (
                <ChevronDown
                  size={14}
                  className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180 text-emerald-400' : ''}`}
                />
              )}
            </div>
          </>
        );

        return (
          <div key={row.key}>
            {canExpand ? (
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : row.key)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between mb-1 -mx-1 px-1 py-0.5 rounded hover:bg-gray-800/40 transition-colors text-left"
              >
                {headerInner}
              </button>
            ) : (
              <div className="flex items-center justify-between mb-1">
                {headerInner}
              </div>
            )}
            <CaliberBar score={score} />
            {canExpand && isOpen && (
              <div className="mt-3 mb-1 px-3 py-3 bg-gray-950/60 border border-gray-800 rounded-xl">
                {row.details}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
