import { getServerAuth } from '@/lib/supabase/server';
import PlayerSearchWidget from '@/components/PlayerSearchWidget';
import { getPlayerCardPage } from '@/lib/playerCardsServer';
import PlayersLazyGrid from './PlayersLazyGrid';

export default async function PlayersPage() {
  const { supabase } = await getServerAuth();
  const playerPage = await getPlayerCardPage({ supabase });

  if (playerPage.items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Players</h1>
          <p className="text-sm text-gray-500 mt-0.5">Search by name or mobile, or browse recent players below</p>
        </div>
        <PlayerSearchWidget />
        <div className="text-center py-12 text-gray-600">No players found.</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Players</h1>
        <p className="text-sm text-gray-500 mt-0.5">Search by name or mobile, or browse recent players below</p>
      </div>

      <PlayerSearchWidget />

      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider -mb-2">Recent players</h2>
      <PlayersLazyGrid
        initialItems={playerPage.items}
        initialHasMore={playerPage.hasMore}
        initialPage={playerPage.page}
      />
    </div>
  );
}
