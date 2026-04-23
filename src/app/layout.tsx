import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import PWARegister from '@/components/PWARegister';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });

export const metadata: Metadata = {
  title: 'GullySports – Local Match Scorer',
  description: 'Score and track your local sports matches',
  applicationName: 'GullySports',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'GullySports',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.svg' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#10b981',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full bg-gray-950 text-white antialiased">
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
