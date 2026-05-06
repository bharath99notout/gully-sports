'use client';

import { CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { useOffline } from '@/lib/offline/OfflineProvider';

/**
 * Sticky banner anchored to the top of the page when:
 *   • the network is offline, OR
 *   • there are queued ops waiting to sync, OR
 *   • there are failed ops awaiting user attention.
 *
 * Designed to be unobtrusive when everything is fine (it renders nothing).
 */
export default function OfflineBanner() {
  const { online, pendingCount, failedCount, retryNow } = useOffline();
  const showOffline = !online;
  const showSyncing = online && pendingCount > 0;
  const showFailed = failedCount > 0;

  if (!showOffline && !showSyncing && !showFailed) return null;

  return (
    <div className="sticky top-0 z-40 flex flex-col gap-1 px-3 py-2">
      {showOffline && (
        <div className="rounded-xl border border-amber-700/60 bg-amber-950/70 backdrop-blur-sm px-3 py-2 flex items-center gap-2 text-xs text-amber-200">
          <CloudOff size={14} className="shrink-0" />
          <span className="flex-1">
            <strong>Offline</strong> — score is being saved on this device.
            {pendingCount > 0 && <> {pendingCount} change{pendingCount === 1 ? '' : 's'} will sync when internet returns.</>}
          </span>
        </div>
      )}
      {showSyncing && (
        <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/60 backdrop-blur-sm px-3 py-2 flex items-center gap-2 text-xs text-emerald-200">
          <RefreshCw size={14} className="shrink-0 animate-spin" />
          <span className="flex-1">
            Syncing {pendingCount} change{pendingCount === 1 ? '' : 's'}…
          </span>
        </div>
      )}
      {showFailed && (
        <div className="rounded-xl border border-red-700/60 bg-red-950/70 backdrop-blur-sm px-3 py-2 flex items-center gap-2 text-xs text-red-200">
          <AlertTriangle size={14} className="shrink-0" />
          <span className="flex-1">
            <strong>{failedCount}</strong> change{failedCount === 1 ? '' : 's'} couldn&apos;t sync — try again or refresh the page.
          </span>
          <button
            type="button"
            onClick={() => { void retryNow(); }}
            className="bg-red-800/40 hover:bg-red-700/40 text-red-100 px-2 py-1 rounded-md font-semibold"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
