import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GullySports – Local Match Scorer',
    short_name: 'GullySports',
    description: 'Score and track gully cricket, football & badminton matches. Build your player caliber.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#10b981',
    background_color: '#030712',
    categories: ['sports', 'lifestyle', 'social'],
    icons: [
      { src: '/icon.svg',     sizes: 'any',     type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png',     purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png',     purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png',     purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png',     purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'New Match',   short_name: 'New', description: 'Start scoring a new match', url: '/matches/new' },
      { name: 'Leaderboard', short_name: 'Top', description: 'See top players',            url: '/leaderboard' },
      { name: 'My Matches',  short_name: 'Log', description: 'View your match history',   url: '/matches' },
    ],
  };
}
