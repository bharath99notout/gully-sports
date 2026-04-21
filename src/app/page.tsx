import Link from 'next/link';
import { Trophy, Zap, Users, BarChart3 } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-emerald-500 p-3 rounded-2xl">
            <Trophy size={32} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white">GullySports</h1>
        </div>

        <p className="text-xl text-gray-300 mb-3 max-w-md">
          Score your local matches in seconds.
        </p>
        <p className="text-gray-500 mb-10 max-w-sm">
          Cricket, Football, Badminton — track live scores, player stats, and match history.
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
            { icon: Trophy, text: 'Match history' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-full px-4 py-2 text-sm text-gray-300">
              <Icon size={14} className="text-emerald-400" />
              {text}
            </div>
          ))}
        </div>

        <div className="flex gap-4 mt-8 text-2xl">
          <span title="Cricket">🏏</span>
          <span title="Football">⚽</span>
          <span title="Badminton">🏸</span>
        </div>
      </div>
    </div>
  );
}
