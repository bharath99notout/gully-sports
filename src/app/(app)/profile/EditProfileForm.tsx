'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Profile } from '@/types';

export default function EditProfileForm({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const initialName = profile?.name ?? '';
  const phone = profile?.phone ?? '';
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

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
    </div>
  );
}
