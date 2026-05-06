// `offlineMutate` — single entry point used by the scorers in place of
// raw `supabase.from(...).update(...)` etc.
//
// Behaviour:
//   1. Online → run the op directly. On success, return `{queued: false}`.
//   2. Online but op throws a transient error (network drop mid-flight) →
//      enqueue and return `{queued: true}` so the UI doesn't surface a
//      misleading error.
//   3. Offline (navigator.onLine === false) → enqueue immediately, never hit
//      the network. Return `{queued: true}`.
//   4. Online but op returns a *terminal* error (RLS, schema, validation) →
//      surface the error so the scorer can show it. Don't queue: replaying
//      will just fail the same way.

import type { SupabaseClient } from '@supabase/supabase-js';
import { executeOp } from './execute';
import { enqueueOp } from './queue';
import { isTransientError } from './ops';
import type { OfflineOp } from './ops';

export interface MutateResult {
  /** Terminal error (won't auto-retry). null on success or when queued. */
  error: { message: string; status?: number; code?: string } | null;
  /** True when the op landed in the offline queue. */
  queued: boolean;
}

export async function offlineMutate(
  supabase: SupabaseClient,
  op: OfflineOp,
  matchId: string | null,
): Promise<MutateResult> {
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (isOffline) {
    await enqueueOp(op, matchId);
    return { error: null, queued: true };
  }

  try {
    const { error } = await executeOp(supabase, op);
    if (!error) return { error: null, queued: false };
    if (isTransientError(error)) {
      await enqueueOp(op, matchId);
      return { error: null, queued: true };
    }
    return { error, queued: false };
  } catch (e) {
    if (isTransientError(e)) {
      await enqueueOp(op, matchId);
      return { error: null, queued: true };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { error: { message: msg }, queued: false };
  }
}
