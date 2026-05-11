import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GullySports – Local Match Scorer',
    short_name: 'GullySports',
    description: 'Score and track gully cricket, football, badminton, table tennis & foosball matches. Build your player caliber.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#10b981',
    background_color: '#030712',
    categories: ['sports', 'lifestyle', 'social'],
    // PNGs in /public/icons — same yellow trophy art as Play Store / Bubblewrap
    // store_icon.png (regenerate those when you replace icon-512.png).
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192-mask.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512-mask.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
    shortcuts: [
      { name: 'New Match',   short_name: 'New', description: 'Start scoring a new match', url: '/matches/new' },
      { name: 'Leaderboard', short_name: 'Top', description: 'See top players',            url: '/leaderboard' },
      { name: 'My Matches',  short_name: 'Log', description: 'View your match history',   url: '/matches' },
    ],
  };
}
