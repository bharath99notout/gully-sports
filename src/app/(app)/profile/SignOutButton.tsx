'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Single tap to log out of this device. Mirrors the Navbar's signOut so the
 * profile page can offer the action without users hunting the menu.
 */
export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (!confirm('Sign out of this device?')) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center justify-center gap-2 bg-gray-900 hover:bg-red-950/40 text-gray-300 hover:text-red-300 border border-gray-800 hover:border-red-900/60 rounded-xl px-4 py-3 text-sm font-medium transition-colors disabled:opacity-50"
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
      Sign out
    </button>
  );
}
