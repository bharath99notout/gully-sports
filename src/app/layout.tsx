import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import PWARegister from '@/components/PWARegister';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });

// metadataBase makes auto-resolved OG/Twitter image URLs absolute (required by
// social crawlers). Falls back to the deployed Vercel URL in production, then
// localhost in dev.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3001');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'GullySports – Local Match Scorer',
  description:
    'Score and track your local cricket, football, badminton, table tennis, pickleball, and foosball matches. Build your player caliber.',
  applicationName: 'GullySports',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'GullySports',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    siteName: 'GullySports',
    title: 'GullySports – Score your gully matches in seconds',
    description:
      'Cricket, football, badminton, table tennis, pickleball & foosball — live scores, player caliber and match history.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GullySports – Score your gully matches in seconds',
    description:
      'Cricket, football, badminton, table tennis, pickleball & foosball — live scores, player caliber and match history.',
  },
};

export const viewport: Viewport = {
  themeColor: '#10b981',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

// Hostnames we'll definitely contact on the very first paint — preconnect
// shaves ~150ms off the first Supabase / avatar-image request on mobile.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : null;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <head>
        {supabaseHost && <link rel="preconnect" href={supabaseHost} crossOrigin="anonymous" />}
        {supabaseHost && <link rel="dns-prefetch" href={supabaseHost} />}
      </head>
      <body className="min-h-full bg-gray-950 text-white antialiased">
        {children}
        <PWARegister />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
