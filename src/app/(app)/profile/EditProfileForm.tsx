'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Profile } from '@/types';

const UPI_VPA_RE = /^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,32}$/;

export default function EditProfileForm({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const initialName = profile?.name ?? '';
  const initialUpi = profile?.upi_vpa ?? '';
  const phone = profile?.phone ?? '';

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  // UPI VPA is its own little inline edit so users can change it
  // independently of name (and so the Save here doesn't accidentally roll
  // back an in-progress name change).
  const [upiEditing, setUpiEditing] = useState(false);
  const [upi, setUpi] = useState(initialUpi);
  const [upiSaving, setUpiSaving] = useState(false);
  const [upiError, setUpiError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim() || name === initialName) {
      setEditing(false);
      setName(initialName);
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('profiles').update({ name: name.trim() }).eq('id', user!.id);
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  function handleCancel() {
    setEditing(false);
    setName(initialName);
  }

  async function handleUpiSave() {
    setUpiError(null);
    const trimmed = upi.trim();
    // Empty = clear it. Non-empty = must match the UPI VPA shape.
    if (trimmed && !UPI_VPA_RE.test(trimmed)) {
      setUpiError('Enter a valid UPI ID like 9876543210@ybl or name@phonepe');
      return;
    }
    setUpiSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('profiles')
      .update({ upi_vpa: trimmed || null })
      .eq('id', user!.id);
    setUpiSaving(false);
    if (error) {
      // PGRST204 / 42703 surface as "Could not find the 'upi_vpa' column" when
      // migration 027 hasn't been applied. Translate the cryptic message into
      // a clear next step instead of dumping it raw.
      const code = (error as { code?: string }).code;
      const looksLikeSchemaCache = /upi_vpa/i.test(error.message)
        || code === 'PGRST204' || code === '42703';
      setUpiError(
        looksLikeSchemaCache
          ? 'UPI feature not enabled yet — apply migration 027 to your Supabase project, then try again.'
          : error.message
      );
      return;
    }
    setUpiEditing(false);
    router.refresh();
  }

  function handleUpiCancel() {
    setUpiEditing(false);
    setUpi(initialUpi);
    setUpiError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-400">Name</label>
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              Edit
            </button>
          )}
        </div>
        {editing ? (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />
            <div className="flex items-center gap-3 text-sm">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="text-emerald-400 hover:text-emerald-300 disabled:text-gray-600 font-medium"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="text-gray-500 hover:text-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-white py-1">{initialName || <span className="text-gray-600">Not set</span>}</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Mobile</label>
        <p className="text-sm text-white py-1">
          <span className="text-gray-500 mr-1">+91</span>
          <span className="tracking-wide">{phone || '—'}</span>
        </p>
        <p className="text-[11px] text-gray-600">Identifies your account. Contact support to change.</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-400">UPI ID (optional)</label>
          {!upiEditing && (
            <button
              type="button"
              onClick={() => setUpiEditing(true)}
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              {initialUpi ? 'Edit' : 'Add'}
            </button>
          )}
        </div>
        {upiEditing ? (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={upi}
              onChange={e => setUpi(e.target.value)}
              placeholder="9876543210@ybl  ·  name@phonepe  ·  name@oksbi"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />
            {upiError && <p className="text-xs text-red-400">{upiError}</p>}
            <div className="flex items-center gap-3 text-sm">
              <button
                type="button"
                onClick={handleUpiSave}
                disabled={upiSaving}
                className="text-emerald-400 hover:text-emerald-300 disabled:text-gray-600 font-medium"
              >
                {upiSaving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleUpiCancel}
                className="text-gray-500 hover:text-gray-300"
              >
                Cancel
              </button>
              {initialUpi && (
                <button
                  type="button"
                  onClick={() => { setUpi(''); }}
                  className="text-red-400 hover:text-red-300 ml-auto"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-white py-1 font-mono tracking-tight">
              {initialUpi || <span className="text-gray-600 font-sans tracking-normal">Not set</span>}
            </p>
            <p className="text-[11px] text-gray-600">
              Used by Events to let players pay you in one tap. Hosts only — leave blank if you collect cash.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
