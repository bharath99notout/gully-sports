'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { listOps, subscribeToQueue } from './queue';
import { drainQueue } from './sync';
import type { PendingOp } from './ops';

interface OfflineState {
  online: boolean;
  /** Number of queued ops not yet applied (excludes failed). */
  pendingCount: number;
  /** Number of ops the queue gave up on (terminal errors). */
  failedCount: number;
  /** Most recent failed ops — surfaced in the banner for diagnosis. */
  failedOps: PendingOp[];
  /** Manual retry trigger; banner exposes this as a button. */
  retryNow: () => Promise<void>;
}

const Ctx = createContext<OfflineState | null>(null);

export function useOffline(): OfflineState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOffline must be used inside <OfflineProvider>');
  return v;
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  // Start as `online: true` server-side AND on first client paint to keep
  // hydration deterministic. The real navigator.onLine value is read in the
  // mount effect below and updates the state if it differs.
  const [online, setOnline] = useState<boolean>(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [failedOps, setFailedOps] = useState<PendingOp[]>([]);
  const supabaseRef = useRef(createClient());

  const refreshCounts = useCallback(async () => {
    const ops = await listOps();
    setPendingCount(ops.filter(o => !o.failed).length);
    const failed = ops.filter(o => o.failed);
    setFailedCount(failed.length);
    setFailedOps(failed);
  }, []);

  const tryDrain = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    await drainQueue(supabaseRef.current);
    await refreshCounts();
  }, [refreshCounts]);

  // Initial mount: sync the optimistic `online: true` to navigator's real
  // value, refresh counts, and kick a drain in case ops survived a reload.
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const realOnline = navigator.onLine;
      setOnline(prev => (prev !== realOnline ? realOnline : prev));
    }
    void (async () => {
      await refreshCounts();
      void tryDrain();
    })();
    const unsub = subscribeToQueue(() => { void refreshCounts(); });
    return () => { unsub(); };
  }, [refreshCounts, tryDrain]);

  // Online/offline event listeners
  useEffect(() => {
    function handleOnline() {
      setOnline(true);
      void tryDrain();
    }
    function handleOffline() {
      setOnline(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodically reconcile in case the browser lied about onLine. A 30s
    // tick is cheap and catches captive-portal / flaky-mobile-tower cases.
    const id = window.setInterval(() => {
      const o = navigator.onLine;
      setOnline(prev => (prev !== o ? o : prev));
      if (o) void tryDrain();
    }, 30_000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.clearInterval(id);
    };
  }, [tryDrain]);

  // beforeunload: if the user tries to close while offline with pending ops,
  // browsers will show their generic "leave site?" prompt. We can't show a
  // custom message but we can opt into the prompt itself.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (pendingCount > 0 && !online) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pendingCount, online]);

  const value: OfflineState = {
    online,
    pendingCount,
    failedCount,
    failedOps,
    retryNow: tryDrain,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
