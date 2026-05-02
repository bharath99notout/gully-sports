'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Trophy, Users, Calendar, User, LogOut, Menu, X, Search, Medal, Share2, ShieldCheck, Hourglass, Bell, Award } from 'lucide-react';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const navItems = [
  { href: '/dashboard',    label: 'Home',        icon: Trophy },
  { href: '/matches',      label: 'Matches',     icon: Calendar },
  { href: '/tournaments',  label: 'Tournaments', icon: Award },
  { href: '/leaderboard',  label: 'Leaderboard', icon: Medal },
  { href: '/players',      label: 'Players',     icon: Search },
  { href: '/teams',        label: 'Teams',       icon: Users },
  { href: '/profile',      label: 'Profile',     icon: User },
];

interface NavbarProps {
  /** Matches the current user still owes a confirm/dispute response on. */
  pendingCount?: number;
  /** Admin queue size — only meaningful when isAdmin is true. */
  adminQueueCount?: number;
  /** In-app alerts (e.g. match completed, needs confirmation). */
  notificationCount?: number;
  isAdmin?: boolean;
}

/**
 * Renders a small red-dot badge with a count. Visually deliberate: the dot
 * sits on top-right of the host element, count overlays it for >0.
 */
function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
      {count > 9 ? '9+' : count}
    </span>
  );
}

export default function Navbar({
  pendingCount = 0,
  adminQueueCount = 0,
  notificationCount = 0,
  isAdmin = false,
}: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
  }

  async function shareApp() {
    if (typeof window === 'undefined') return;

    // If logged in, share the user's public profile so receivers land on
    // a meaningful page (stats, caliber) rather than the landing page.
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let url = window.location.origin;
    let text = '🏆 Score your gully cricket, football, badminton & table tennis matches on GullySports. Build your career stats!';

    if (user) {
      const { data: profile } = await supabase
        .from('profiles').select('name').eq('id', user.id).single();
      url = `${window.location.origin}/p/${user.id}`;
      text = `🏆 Check out my GullySports profile${profile?.name ? ` — ${profile.name}` : ''}. Join me and score your matches!`;
    }

    if ('share' in navigator) {
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
          {navItems.map(({ href, label, icon: Icon }) => {
            // Pending-confirmation count rides on Home. Keeps the badge near
            // the dashboard where the action is taken.
            const showPending = href === '/dashboard' && pendingCount > 0;
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  pathname.startsWith(href)
                    ? 'bg-emerald-900/50 text-emerald-400'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <span className="relative">
                  <Icon size={16} />
                  {showPending && <CountBadge count={pendingCount} />}
                </span>
                {label}
              </Link>
            );
          })}
          <Link
            href="/notifications"
            className={`relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${
              pathname.startsWith('/notifications')
                ? 'bg-emerald-900/50 text-emerald-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
            title="Notifications"
          >
            <span className="relative">
              <Bell size={18} />
              <CountBadge count={notificationCount} />
            </span>
          </Link>
          {isAdmin && (
            <Link
              href="/admin/matches"
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                pathname.startsWith('/admin')
                  ? 'bg-amber-900/40 text-amber-300'
                  : 'text-amber-400/70 hover:text-amber-300 hover:bg-amber-900/20'
              }`}
              title="Admin queue"
            >
              <span className="relative">
                <ShieldCheck size={16} />
                <CountBadge count={adminQueueCount} />
              </span>
              Admin
            </Link>
          )}
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
            className="relative p-2 text-gray-400"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
            {/* Combined unread indicator so users notice it without opening the menu. */}
            <CountBadge count={pendingCount + notificationCount + (isAdmin ? adminQueueCount : 0)} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-800 bg-gray-950 px-4 py-2 flex flex-col gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const showPending = href === '/dashboard' && pendingCount > 0;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  pathname.startsWith(href)
                    ? 'bg-emerald-900/50 text-emerald-400'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon size={16} />
                  {label}
                </span>
                {showPending && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
                    <Hourglass size={11} />
                    {pendingCount} pending
                  </span>
                )}
              </Link>
            );
          })}
          <Link
            href="/notifications"
            onClick={() => setMenuOpen(false)}
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname.startsWith('/notifications')
                ? 'bg-emerald-900/50 text-emerald-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <span className="flex items-center gap-2">
              <Bell size={16} />
              Notifications
            </span>
            {notificationCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </Link>
          {isAdmin && (
            <Link
              href="/admin/matches"
              onClick={() => setMenuOpen(false)}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                pathname.startsWith('/admin')
                  ? 'bg-amber-900/40 text-amber-300'
                  : 'text-amber-400/80 hover:text-amber-300 hover:bg-amber-900/20'
              }`}
            >
              <span className="flex items-center gap-2">
                <ShieldCheck size={16} />
                Admin queue
              </span>
              {adminQueueCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {adminQueueCount > 9 ? '9+' : adminQueueCount}
                </span>
              )}
            </Link>
          )}
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
