import { revalidateTag as nextRevalidateTag } from 'next/cache';

/**
 * Central Next.js cache tag strings. Keep stable — changing a tag invalidates
 * nothing until the next deploy that ships new code calling it.
 *
 * Next.js 16+ requires a cache-life profile on `revalidateTag`; use this helper
 * instead of calling `revalidateTag` from `next/cache` directly.
 */
export function revalidateCacheTag(tag: string): void {
  nextRevalidateTag(tag, 'default');
}

export const CACHE_TAG_LEADERBOARD = 'global-leaderboard';
export const CACHE_TAG_EVENTS_FEED = 'events-feed';
export const CACHE_TAG_PICKUPS = 'pickups';

export function cacheTagEvent(eventId: string): string {
  return `event-${eventId}`;
}

export function cacheTagPublicPlayer(playerId: string): string {
  return `public-player-${playerId}`;
}
