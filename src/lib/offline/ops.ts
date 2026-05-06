// Op shapes for the offline queue. Every Supabase mutation the scorers can
// make is expressible as one of these — we serialize the intent rather than
// the request, so we can replay against a fresh client when the network
// returns (auth tokens may have rotated).

export type WhereClause = Record<string, string | number | boolean | null>;

export type OfflineOp =
  | {
      kind: 'update';
      table: string;
      values: Record<string, unknown>;
      where: WhereClause;
    }
  | {
      kind: 'upsert';
      table: string;
      values: Record<string, unknown> | Record<string, unknown>[];
      onConflict?: string;
    }
  | {
      kind: 'insert';
      table: string;
      values: Record<string, unknown> | Record<string, unknown>[];
    }
  | {
      kind: 'delete';
      table: string;
      where: WhereClause;
    };

export interface PendingOp {
  /** Client-generated UUID. Lets us dedupe across reloads / retries. */
  id: string;
  /** The match this op belongs to — used to scope listings, debugging. */
  match_id: string | null;
  op: OfflineOp;
  created_at: number;
  attempts: number;
  last_error: string | null;
  /** True once we've decided this op cannot be replayed (terminal 4xx). */
  failed: boolean;
}

/**
 * Heuristic: is this an error we should retry, or a terminal failure?
 *
 * Network-level (offline / DNS / fetch failure) → retry.
 * 5xx / 408 / 429 → retry.
 * 401 / 403 / 4xx other → terminal — likely a permission or schema issue
 *   that won't resolve by waiting. The user must intervene.
 */
export function isTransientError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { message?: string; code?: string; status?: number; name?: string };

  // Network class — TypeError 'Failed to fetch' is the canonical browser
  // signal that the request never reached the server.
  if (e.name === 'TypeError' && /fetch|network/i.test(e.message ?? '')) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;

  // PostgREST surfaces HTTP status as `status` on the error object.
  if (typeof e.status === 'number') {
    if (e.status >= 500) return true;
    if (e.status === 408 || e.status === 429) return true;
    return false;
  }

  // Supabase JS sometimes attaches a `code`. Postgres connection errors
  // begin with 08; PostgREST uses PGRST00x. Treat unknown as transient
  // unless we have evidence otherwise — better to retry a benign op than to
  // surface noise.
  const msg = e.message ?? '';
  if (/network|timeout|abort|fetch failed/i.test(msg)) return true;

  return false;
}

export function newOpId(): string {
  // RFC4122 v4-ish; good enough for client-side correlation.
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'op-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
