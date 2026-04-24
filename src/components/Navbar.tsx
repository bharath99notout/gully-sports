'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Trophy, Users, Calendar, User, LogOut, Menu, X, Search, Medal, Share2 } from 'lucide-react';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const navItems = [
  { href: '/dashboard',   label: 'Home',        icon: Trophy },
  { href: '/matches',     label: 'Matches',     icon: Calendar },
  { href: '/leaderboard', label: 'Leaderboard', icon: Medal },
  { href: '/players',     label: 'Players',     icon: Search },
  { href: '/teams',       label: 'Teams',       icon: Users },
  { href: '/profile',     label: 'Profile',     icon: User },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
  }

  async function shareApp() {
    const url = typeof window !== 'undefined' ? window.location.origin : '';
    const text = '🏆 Score your gully cricket, football & badminton matches on GullySports. Build your career stats!';
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try { await navigator.share({ title: 'GullySports', text, url }); return; }
      catch { /* fall through */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <nav className="bg-gray-950 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-emerald-400 text-lg">
          <Trophy size={20} />
          GullySports
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                pathname.startsWith(href)
                  ? 'bg-emerald-900/50 text-emerald-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
          <button
            onClick={shareApp}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/30 transition-colors ml-2"
            title="Share GullySports"
          >
            <Share2 size={16} />
            Share
          </button>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>

        {/* Mobile share icon + menu toggle */}
        <div className="md:hidden flex items-center gap-1">
          <button
            onClick={shareApp}
            className="p-2 text-emerald-400 hover:text-emerald-300"
            title="Share GullySports"
          >
            <Share2 size={18} />
          </button>
          <button
            className="p-2 text-gray-400"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        <button
          className="md:hidden text-gray-400"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-800 bg-gray-950 px-4 py-2 flex flex-col gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                pathname.startsWith(href)
                  ? 'bg-emerald-900/50 text-emerald-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
          <button
            onClick={() => { setMenuOpen(false); shareApp(); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/30 transition-colors"
          >
            <Share2 size={16} />
            Share GullySports
          </button>
          <button
            onClick={signOut}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      )}
    </nav>
  );
}
