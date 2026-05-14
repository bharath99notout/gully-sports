'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AthleteCardMini } from '@/components/AthleteCard';
import type { PlayerCardItem, PlayerCardPage } from '@/lib/playerCards';

export default function PlayersLazyGrid({
  initialItems,
  initialHasMore,
  initialPage,
}: {
  initialItems: PlayerCardItem[];
  initialHasMore: boolean;
  initialPage: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const nextPage = page + 1;
      const response = await fetch(`/api/players?page=${nextPage}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Failed to load page ${nextPage}`);
      }

      const payload = await response.json() as PlayerCardPage;
      setItems((currentItems) => {
        const seen = new Set(currentItems.map(item => item.athlete.id));
        const newItems = payload.items.filter(item => !seen.has(item.athlete.id));
        return [...currentItems, ...newItems];
      });
      setPage(payload.page);
      setHasMore(payload.hasMore);
    } catch (err) {
      console.error('[PlayersLazyGrid] load failed', err);
      setError('Could not load more players.');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, page]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || error) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '300px 0px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [error, hasMore, loadMore]);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map(({ athlete, trustScore }) => (
          <AthleteCardMini key={athlete.id} athlete={athlete} trustScore={trustScore} />
        ))}
      </div>

      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center pt-1">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="text-sm font-semibold text-emerald-400 hover:text-emerald-300 disabled:text-gray-700 transition-colors"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}

      {error && (
        <p className="text-center text-xs text-red-400" role="status">
          {error}
        </p>
      )}
    </>
  );
}
