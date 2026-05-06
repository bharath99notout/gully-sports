// Apply an OfflineOp against a Supabase client. Used both for the immediate
// online path (offlineMutate's first attempt) and for the drainer.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfflineOp } from './ops';

export type ExecuteResult = { error: { message: string; status?: number; code?: string } | null };

/**
 * Returns `{ error: null }` on success. The caller decides whether the error
 * is transient (queue + retry) or terminal (mark failed + surface to user).
 *
 * NB: we use `as unknown as ...` casts because PostgREST's chained builder
 * types are awkward to satisfy generically without losing the simplicity of
 * the OfflineOp shape.
 */
export async function executeOp(supabase: SupabaseClient, op: OfflineOp): Promise<ExecuteResult> {
  switch (op.kind) {
    case 'insert': {
      const { error } = await supabase.from(op.table).insert(op.values as never);
      return { error: error ? { message: error.message, code: error.code, status: (error as { status?: number }).status } : null };
    }
    case 'upsert': {
      const opts = op.onConflict ? { onConflict: op.onConflict } : undefined;
      const { error } = await supabase.from(op.table).upsert(op.values as never, opts);
      return { error: error ? { message: error.message, code: error.code, status: (error as { status?: number }).status } : null };
    }
    case 'update': {
      let q = supabase.from(op.table).update(op.values as never);
      for (const [col, val] of Object.entries(op.where)) {
        q = q.eq(col, val);
      }
      const { error } = await q;
      return { error: error ? { message: error.message, code: error.code, status: (error as { status?: number }).status } : null };
    }
    case 'delete': {
      let q = supabase.from(op.table).delete();
      for (const [col, val] of Object.entries(op.where)) {
        q = q.eq(col, val);
      }
      const { error } = await q;
      return { error: error ? { message: error.message, code: error.code, status: (error as { status?: number }).status } : null };
    }
  }
}
