import Navbar from '@/components/Navbar';
import OfflineBanner from '@/components/OfflineBanner';
import { OfflineProvider } from '@/lib/offline/OfflineProvider';
import { getServerAuth } from '@/lib/supabase/server';
import {
  getPendingMatchesForUser,
  getAdminQueueCount,
  isUserAdmin,
  maybeSweepAutoConfirms,
} from '@/lib/matchConfirmationServer';
import { getUnreadNotificationCount } from '@/lib/notificationsServer';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Trust badges on the Navbar — fetched once per layout render. Cheap:
  // both queries are head-only / index-served.
  const { user } = await getServerAuth();

  let pendingCount = 0;
  let adminQueueCount = 0;
  let notificationCount = 0;
  let isAdmin = false;
  if (user) {
    await maybeSweepAutoConfirms();
    const [pending, admin, notif] = await Promise.all([
      getPendingMatchesForUser(user.id),
      isUserAdmin(user.id),
      getUnreadNotificationCount(user.id),
    ]);
    pendingCount = pending.length;
    isAdmin = admin;
    notificationCount = notif;
    if (admin) adminQueueCount = await getAdminQueueCount();
  }

  return (
    <OfflineProvider>
      <div className="min-h-screen bg-gray-950 flex flex-col">
        <Navbar
          pendingCount={pendingCount}
          adminQueueCount={adminQueueCount}
          notificationCount={notificationCount}
          isAdmin={isAdmin}
        />
        <OfflineBanner />
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
          {children}
        </main>
      </div>
    </OfflineProvider>
  );
}
