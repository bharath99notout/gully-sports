'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { markAllNotificationsRead } from '@/app/actions/notifications';

/**
 * Mounted at the top of /notifications. Marks every unread notification as
 * read on visit (server action), then triggers `router.refresh()` so the
 * Navbar's count badge re-fetches and clears immediately — without the user
 * having to navigate away.
 *
 * Idempotent: re-running on already-read notifications is a no-op (the
 * server action filters `read_at IS NULL`).
 */
export default function AutoMarkAllRead() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      await markAllNotificationsRead();
      router.refresh();
    })();
  }, [router]);
  return null;
}
