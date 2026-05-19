import Link from 'next/link';
import { Zap, Users, BarChart3, History } from 'lucide-react';
import AppLogoMark from '@/components/AppLogoMark';
import SportIcon from '@/components/SportIcon';

const LANDING_SPORTS = [
  { sport: 'cricket', label: 'Cricket' },
  { sport: 'football', label: 'Football' },
  { sport: 'badminton', label: 'Badminton' },
  { sport: 'table_tennis', label: 'Table tennis' },
  { sport: 'pickleball', label: 'Pickleball' },
  { sport: 'foosball', label: 'Foosball' },
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20">
        <h1 className="mb-6 flex justify-center m-0">
          <AppLogoMark iconSize={48} wordmarkClassName="text-4xl font-bold text-white" />
        </h1>

        <p className="text-xl text-gray-300 mb-3 max-w-md">
          Score your local matches in seconds.
        </p>
        <p className="text-gray-500 mb-10 max-w-md px-1">
          Cricket, football, badminton, table tennis, pickleball, and foosball — track live scores, player stats, and match history.
        </p>

        <div className="flex gap-3">
          <Link
            href="/auth/signup"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
          >
            Get Started Free
          </Link>
          <Link
            href="/auth/login"
            className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors border border-gray-700"
          >
            Sign In
          </Link>
        </div>

        <div className="flex flex-wrap justify-center gap-3 mt-14">
          {[
            { icon: Zap, text: 'Score in 10 seconds' },
            { icon: Users, text: 'Team management' },
            { icon: BarChart3, text: 'Player stats' },
            { icon: History, text: 'Match history' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-full px-4 py-2 text-sm text-gray-300">
              <Icon size={14} className="text-emerald-400" />
              {text}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-4 mt-8 text-2xl items-center">
          {LANDING_SPORTS.map(({ sport, label }) => (
            <span key={sport} className="inline-flex leading-none" role="img" aria-label={label}>
              <SportIcon sport={sport} className="text-2xl" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
