import type { AthleteData } from '@/components/AthleteCard';
import type { PlayerTrustScore } from './trustScore';

export const PLAYERS_PAGE_SIZE = 20;

export type PlayerCardItem = {
  athlete: AthleteData;
  trustScore?: PlayerTrustScore;
};

export type PlayerCardPage = {
  items: PlayerCardItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  sort: 'newest';
};

export function normalizePlayersPage(page: number | string | null | undefined): number {
  const parsed = typeof page === 'number'
    ? page
    : Number.parseInt(page ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
