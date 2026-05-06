// IDB-backed FIFO queue. Falls back to an in-memory array if IDB is
// unavailable, so a private-mode user can still finish the over (we just
// can't survive a reload).

import { withStore, req } from './db';
import type { OfflineOp, PendingOp } from './ops';
import { newOpId } from './ops';

let memoryQueue: PendingOp[] = [];
let useMemoryFallback = false;

function makePending(op: OfflineOp, matchId: string | null): PendingOp {
  return {
    id: newOpId(),
    match_id: matchId,
    op,
    created_at: Date.now(),
    attempts: 0,
    last_error: null,
    failed: false,
  };
}

export async function enqueueOp(op: OfflineOp, matchId: string | null): Promise<PendingOp> {
  const pending = makePending(op, matchId);
  if (useMemoryFallback) {
    memoryQueue.push(pending);
    notifyChange();
    return pending;
  }
  const ok = await withStore('readwrite', s => req(s.add(pending)));
  if (ok === null) {
    useMemoryFallback = true;
    memoryQueue.push(pending);
  }
  notifyChange();
  return pending;
}

export async function listOps(): Promise<PendingOp[]> {
  if (useMemoryFallback) return [...memoryQueue].sort((a, b) => a.created_at - b.created_at);
  const all = await withStore('readonly', s => req(s.index('by_created_at').getAll()));
  return (all as PendingOp[] | null) ?? [];
}

export async function listOpsForMatch(matchId: string): Promise<PendingOp[]> {
  if (useMemoryFallback) return memoryQueue.filter(o => o.match_id === matchId);
  const all = await withStore('readonly', s => req(s.index('by_match_id').getAll(IDBKeyRange.only(matchId))));
  return ((all as PendingOp[] | null) ?? []).sort((a, b) => a.created_at - b.created_at);
}

export async function removeOp(id: string): Promise<void> {
  if (useMemoryFallback) {
    memoryQueue = memoryQueue.filter(o => o.id !== id);
    notifyChange();
    return;
  }
  await withStore('readwrite', s => req(s.delete(id)));
  notifyChange();
}

export async function updateOp(id: string, patch: Partial<PendingOp>): Promise<void> {
  if (useMemoryFallback) {
    memoryQueue = memoryQueue.map(o => (o.id === id ? { ...o, ...patch } : o));
    notifyChange();
    return;
  }
  await withStore('readwrite', async s => {
    const cur = (await req(s.get(id))) as PendingOp | undefined;
    if (!cur) return;
    await req(s.put({ ...cur, ...patch }));
  });
  notifyChange();
}

export async function countActiveOps(): Promise<number> {
  const ops = await listOps();
  return ops.filter(o => !o.failed).length;
}

// ── Subscribe to queue changes (for the UI badge) ────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribeToQueue(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function notifyChange() {
  for (const l of listeners) {
    try { l(); } catch { /* ignore */ }
  }
}
