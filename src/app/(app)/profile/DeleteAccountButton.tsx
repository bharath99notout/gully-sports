'use client';

import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Two-step account deletion. First click opens an inline confirm panel that
 * spells out exactly what stays (matches, scores) and what goes (name,
 * avatar, phone, UPI, email-OTP). Second click hits /api/auth/delete-account
 * which runs the soft_delete_account RPC, then we sign the user out and
 * route them to /auth/login with a friendly toast param.
 *
 * No "are you sure" alert() -- the inline panel is more discoverable on
 * mobile and avoids the native dialog feeling like a browser warning.
 */
export default function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/delete-account', { method: 'POST' });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error || 'Could not delete account. Try again.');
        setBusy(false);
        return;
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.href = '/auth/login?deleted=1';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 bg-gray-900 hover:bg-red-950/40 text-gray-400 hover:text-red-300 border border-gray-800 hover:border-red-900/60 rounded-xl px-4 py-3 text-sm font-medium transition-colors"
      >
        <Trash2 size={14} />
        Delete account
      </button>
    );
  }

  return (
    <div className="bg-red-950/20 border border-red-900/60 rounded-xl p-4 flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold text-red-200">Delete this account?</p>
        <ul className="text-xs text-red-300/80 mt-2 space-y-1 list-disc list-inside leading-relaxed">
          <li>Your name, photo, mobile and UPI will be removed.</li>
          <li>Your matches, scores and stats will stay (they belong to the other players too).</li>
          <li>Your name on those matches will appear as <span className="font-medium">&quot;Deleted user&quot;</span>.</li>
          <li>If you sign in again with the same number, your account will be restored.</li>
        </ul>
      </div>

      {error && <p className="text-xs text-red-300">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="flex-1 inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Yes, delete
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          disabled={busy}
          className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
