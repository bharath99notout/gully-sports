// Drain the offline queue against a fresh Supabase client. Triggered:
//   • on page load (in case the previous session left ops behind)
//   • when window 'online' fires
//   • after a successful direct mutate (catches an op that arrived while a
//     previous drain was running)
//
// FIFO; serial; single-flight (a second call while one is running is a no-op).

import type { SupabaseClient } from '@supabase/supabase-js';
import { executeOp } from './execute';
import { listOps, removeOp, updateOp } from './queue';
import { isTransientError } from './ops';
import type { PendingOp } from './ops';

let inflight: Promise<DrainSummary> | null = null;
const MAX_ATTEMPTS_BEFORE_PAUSE = 5;

export interface DrainSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  /** Stopped on a transient error — try again on next online tick. */
  stopped: boolean;
}

export function drainQueue(supabase: SupabaseClient): Promise<DrainSummary> {
  if (inflight) return inflight;
  inflight = drainInner(supabase).finally(() => { inflight = null; });
  return inflight;
}

async function drainInner(supabase: SupabaseClient): Promise<DrainSummary> {
  const summary: DrainSummary = { attempted: 0, succeeded: 0, failed: 0, stopped: false };

  // Refresh the session up front. supabase-js auto-refreshes on a timer, but
  // the timer can lag after a long offline stretch; an explicit getSession()
  // forces a refresh if the access token is near/past expiry. If this fails
  // we still try the drain — a session-less call will surface as a 401 below.
  try { await supabase.auth.getSession(); } catch { /* ignore */ }

  // Re-list each iteration so listeners see progress and we pick up ops
  // enqueued mid-drain.
  while (true) {
    const ops = await listOps();
    const next = ops.find(o => !o.failed);
    if (!next) break;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      summary.stopped = true;
      break;
    }
    summary.attempted += 1;

    const result = await safeExecute(supabase, next);
    if (result.ok) {
      await removeOp(next.id);
      summary.succeeded += 1;
      continue;
    }
    if (result.transient) {
      // Pause — let the network recover. The next 'online' event or a manual
      // retry will trigger another drain.
      await updateOp(next.id, {
        attempts: next.attempts + 1,
        last_error: result.message,
        // After many transient retries, mark as failed so we don't block
        // subsequent ops indefinitely. The user can intervene from the UI.
        failed: next.attempts + 1 >= MAX_ATTEMPTS_BEFORE_PAUSE,
      });
      summary.stopped = true;
      break;
    }
    // Terminal — record and skip so we don't block the rest of the queue.
    await updateOp(next.id, {
      attempts: next.attempts + 1,
      last_error: result.message,
      failed: true,
    });
    summary.failed += 1;
  }
  return summary;
}

async function safeExecute(supabase: SupabaseClient, p: PendingOp) {
  try {
    const { error } = await executeOp(supabase, p.op);
    if (!error) return { ok: true as const, transient: false, message: '' };

    // Idempotency: a unique-violation on retry usually means the op was
    // already applied on a previous attempt and the client never saw the
    // ack (network died after the server committed). Treat as success so
    // the drainer doesn't get stuck on a row that's actually fine.
    //   - PostgREST surfaces unique violations as HTTP 409.
    //   - Postgres SQLSTATE 23505 may appear in `code` for some errors.
    if (p.op.kind === 'insert' && (error.status === 409 || error.code === '23505')) {
      return { ok: true as const, transient: false, message: '' };
    }
    return { ok: false as const, transient: isTransientError(error), message: error.message };
  } catch (e) {
    return { ok: false as const, transient: isTransientError(e), message: e instanceof Error ? e.message : String(e) };
  }
}
