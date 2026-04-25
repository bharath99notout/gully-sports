// Pure types + helpers for match confirmation. SAFE TO IMPORT FROM CLIENT.
// Anything that touches the server Supabase client lives in matchConfirmationServer.ts
// so this module stays free of `next/headers` imports.

/** Confirmation states a match can be in. Mirrors the DB CHECK constraint. */
export type ConfirmationState =
  | 'pending'
  | 'confirmed'
  | 'disputed'
  | 'force_pushed'
  | 'rejected';

/** Per-participant confirmation row from match_confirmations. */
export interface MatchConfirmation {
  match_id: string;
  player_id: string;
  status: 'pending' | 'confirmed' | 'disputed';
  disputed_reason: string | null;
  responded_at: string | null;
}

/**
 * Phase 1 integrity: only matches every side has accepted (or auto-confirmed
 * after 6h) count toward caliber, leaderboard, and detailed stat tiles.
 * Pending, disputed, force_pushed, and rejected are all excluded.
 */
export function isMatchExcludedFromStats(state: ConfirmationState | null | undefined): boolean {
  return state !== 'confirmed';
}

/** Human-readable label for a confirmation state. */
export function describeConfirmationState(state: ConfirmationState): {
  label: string;
  tone: 'neutral' | 'warning' | 'danger' | 'success';
  hint?: string;
} {
  switch (state) {
    case 'pending':
      return { label: 'Pending confirmation', tone: 'warning', hint: 'Auto-confirms in 6h' };
    case 'confirmed':
      return { label: 'Confirmed', tone: 'success' };
    case 'disputed':
      return { label: 'Disputed', tone: 'danger', hint: 'Awaiting scorer response' };
    case 'force_pushed':
      return { label: 'Force-pushed — admin review', tone: 'danger' };
    case 'rejected':
      return { label: 'Rejected by admin', tone: 'danger', hint: 'Stats removed' };
  }
}
