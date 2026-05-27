import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getServerAuth } from '@/lib/supabase/server';
import { getNearbyPickups } from '@/lib/pickupsServer';
import DiscoverByDay from './DiscoverByDay';

export const metadata = {
  title: 'Discover Pickups – GullySports',
};

export default async function DiscoverPickupsPage() {
  const { user } = await getServerAuth();
  if (!user) redirect('/auth/login?next=/pickups/discover');

  // No radius / no viewer coords on the server — the client decorates with
  // GPS distance once it resolves. Server returns every open pickup in the
  // next 14 days.
  const items = await getNearbyPickups({
    viewerId: user.id,
    viewerLat: null,
    viewerLng: null,
    radiusKm: null,
    limit: 200,
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Discover pickups</h1>
          <p className="text-xs text-gray-500 mt-0.5">Open games near you over the next 2 weeks</p>
        </div>
        <Link
          href="/pickups/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shrink-0"
        >
          <Plus size={14} /> Post
        </Link>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <Link href="/pickups" className="text-gray-400 hover:text-gray-200 underline-offset-2 hover:underline">
          My pickups
        </Link>
        <span className="text-gray-700">·</span>
        <span className="text-emerald-400 font-semibold">Discover</span>
      </div>

      <DiscoverByDay initialItems={items} viewerId={user.id} />
    </div>
  );
}
