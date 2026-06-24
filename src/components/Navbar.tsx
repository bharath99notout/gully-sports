'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Users, Calendar, User, LogOut, Menu, X, Search, Medal, Share2, ShieldCheck, Bell, Award, CalendarDays, School, MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import AppLogoMark from '@/components/AppLogoMark';

const primaryNavItems = [
  { href: '/dashboard',    label: 'Home',        icon: Home },
  { href: '/events',       label: 'Events',      icon: CalendarDays },
  { href: '/matches',      label: 'Matches',     icon: Calendar },
  { href: '/tournaments',  label: 'Tournaments', icon: Award },
  { href: '/school',       label: 'School',      icon: School },
];

const secondaryNavItems = [
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
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function onDocMouseDown(event: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [moreOpen]);

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
        <Link href="/dashboard" className="flex items-center gap-2">
          <AppLogoMark iconSize={24} wordmarkClassName="text-lg font-bold text-emerald-400" />
        </Link>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-1">
          {primaryNavItems.map(({ href, label, icon: Icon }) => {
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
          <button
            onClick={shareApp}
            className="flex items-center justify-center rounded-lg p-2 text-emerald-400 transition-colors hover:bg-emerald-900/30 hover:text-emerald-300"
            title="Share GullySports"
          >
            <Share2 size={16} />
          </button>
          <div ref={moreRef} className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen(current => !current)}
              className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                secondaryNavItems.some(item => pathname.startsWith(item.href)) || (isAdmin && pathname.startsWith('/admin'))
                  ? 'bg-emerald-900/50 text-emerald-400'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
            >
              <span className="relative">
                <MoreHorizontal size={16} />
                <CountBadge count={isAdmin ? adminQueueCount : 0} />
              </span>
              More
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-gray-800 bg-gray-950 p-1 shadow-2xl" role="menu">
                {secondaryNavItems.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                      pathname.startsWith(href)
                        ? 'bg-emerald-900/50 text-emerald-400'
                        : 'text-gray-400 hover:bg-gray-900 hover:text-white'
                    }`}
                    role="menuitem"
                  >
                    <Icon size={16} />
                    {label}
                  </Link>
                ))}
                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                      pathname.startsWith('/admin')
                        ? 'bg-amber-900/40 text-amber-300'
                        : 'text-amber-400/80 hover:bg-amber-900/20 hover:text-amber-300'
                    }`}
                    role="menuitem"
                  >
                    <span className="flex items-center gap-2">
                      <ShieldCheck size={16} />
                      Admin
                    </span>
                    {adminQueueCount > 0 && (
                      <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {adminQueueCount > 9 ? '9+' : adminQueueCount}
                      </span>
                    )}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => { setMoreOpen(false); void signOut(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-900 hover:text-red-400"
                  role="menuitem"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile share icon + menu toggle */}
        <div className="flex items-center gap-1 lg:hidden">
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
        <div className="max-h-[calc(100vh-3.5rem)] overflow-y-auto border-t border-gray-800 bg-gray-950 px-4 py-3 lg:hidden">
          <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-600">Main</p>
          <div className="grid grid-cols-2 gap-2">
            {primaryNavItems.map(({ href, label, icon: Icon }) => {
            const showPending = href === '/dashboard' && pendingCount > 0;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname.startsWith(href)
                    ? 'bg-emerald-900/50 text-emerald-400'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon size={16} />
                  {label}
                </span>
                {showPending && <span className="h-2 w-2 rounded-full bg-red-500" />}
              </Link>
            );
          })}
          </div>
          <div className="mt-3 border-t border-gray-800 pt-3">
            <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-600">More</p>
            <div className="grid grid-cols-2 gap-2">
              {secondaryNavItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    pathname.startsWith(href)
                      ? 'bg-emerald-900/50 text-emerald-400'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              ))}
          <Link
            href="/notifications"
            onClick={() => setMenuOpen(false)}
                className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
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
              href="/admin"
              onClick={() => setMenuOpen(false)}
                  className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                pathname.startsWith('/admin')
                  ? 'bg-amber-900/40 text-amber-300'
                  : 'text-amber-400/80 hover:text-amber-300 hover:bg-amber-900/20'
              }`}
            >
              <span className="flex items-center gap-2">
                <ShieldCheck size={16} />
                Admin
              </span>
              {adminQueueCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {adminQueueCount > 9 ? '9+' : adminQueueCount}
                </span>
              )}
            </Link>
          )}
          <button
            onClick={signOut}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-red-400"
          >
            <LogOut size={16} />
            Sign Out
          </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
