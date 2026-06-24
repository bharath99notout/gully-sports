'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2, Search, Trash2, UserRoundPlus, X } from 'lucide-react';
import { addSchoolMember, removeSchoolMember, updateSchoolMemberRole } from '@/app/actions/schoolSports';
import { SegmentedChoice, type ChoiceOption } from '@/components/SchoolFormControls';
import { createClient } from '@/lib/supabase/client';

type AccessRole = 'teacher' | 'scorer';
type ProfileHit = { id: string; name: string | null; phone: string | null };
type Member = {
  id: string;
  user_id: string;
  role: 'admin' | 'teacher' | 'scorer';
  profile?: { id: string; name: string | null; phone: string | null } | null;
};

const ROLE_OPTIONS: ChoiceOption<AccessRole>[] = [
  { value: 'teacher', label: 'Edit', tone: 'blue' },
  { value: 'scorer', label: 'View' },
];

const AVATAR_TONES = [
  'bg-sky-500/20 text-sky-200 ring-sky-400/40',
  'bg-violet-500/20 text-violet-200 ring-violet-400/40',
  'bg-amber-500/20 text-amber-200 ring-amber-400/40',
  'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40',
  'bg-rose-500/20 text-rose-200 ring-rose-400/40',
];

export default function SchoolAccessPanel({ schoolId, members }: { schoolId: string; members: Member[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ProfileHit[]>([]);
  const [selected, setSelected] = useState<ProfileHit | null>(null);
  const [role, setRole] = useState<AccessRole>('scorer');
  const [busy, setBusy] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const memberIds = new Set(members.map(member => member.user_id));

  async function searchProfiles(value: string) {
    setQuery(value);
    setSelected(null);
    setHits([]);
    setError('');
    const term = value.trim();
    if (term.length < 2) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const supabase = createClient();
    try {
      const [{ data: byName }, { data: byPhone }] = await Promise.all([
        supabase.from('profiles').select('id, name, phone').ilike('name', `%${term}%`).limit(6),
        supabase.from('profiles').select('id, name, phone').ilike('phone', `%${term}%`).limit(6),
      ]);
      const seen = new Set<string>();
      const next = [...(byName ?? []), ...(byPhone ?? [])]
        .filter(hit => !memberIds.has(hit.id))
        .filter(hit => !seen.has(hit.id) && !!seen.add(hit.id))
        .slice(0, 6);
      setHits(next as ProfileHit[]);
    } finally {
      setSearching(false);
    }
  }

  async function addMember() {
    if (!selected) return;
    setBusy('add');
    setError('');
    const result = await addSchoolMember({ schoolId, profileId: selected.id, role });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    closeComposer();
    router.refresh();
  }

  function closeComposer() {
    setQuery('');
    setSelected(null);
    setHits([]);
    setComposerOpen(false);
  }

  async function updateRole(memberId: string, nextRole: AccessRole) {
    setBusy(memberId);
    setError('');
    const result = await updateSchoolMemberRole({ schoolId, memberId, role: nextRole });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function removeMember(memberId: string) {
    setBusy(memberId);
    setError('');
    const result = await removeSchoolMember({ schoolId, memberId });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const adminCount = members.filter(m => m.role === 'admin').length;
  const editorCount = members.filter(m => m.role === 'teacher').length;
  const viewerCount = members.filter(m => m.role === 'scorer').length;

  return (
    <section className="overflow-hidden rounded-2xl border border-sky-900/50 bg-gradient-to-b from-sky-950/30 to-gray-950/60">
      <header className="flex items-center justify-between gap-3 border-b border-sky-900/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/30">
            <KeyRound size={14} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-white">Staff access</h2>
            <p className="text-[11px] text-sky-200/60">
              {members.length} {members.length === 1 ? 'person' : 'people'}
              {adminCount > 0 && ` · ${adminCount} admin`}
              {editorCount > 0 && ` · ${editorCount} editor${editorCount === 1 ? '' : 's'}`}
              {viewerCount > 0 && ` · ${viewerCount} viewer${viewerCount === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        {!composerOpen && (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
          >
            <UserRoundPlus size={13} />
            Grant access
          </button>
        )}
      </header>

      {error && (
        <p className="mx-4 mt-3 rounded-lg border border-red-900/70 bg-red-950/30 px-3 py-2 text-xs text-red-200">{error}</p>
      )}

      {composerOpen && (
        <div className="border-b border-sky-900/40 bg-sky-950/20 px-4 py-3">
          <div className="grid gap-2 lg:grid-cols-[1fr_11rem_auto_auto]">
            <div className="relative">
              <div className="flex h-10 items-center gap-2 rounded-xl border border-gray-800 bg-gray-950 px-3">
                <Search size={13} className="text-gray-500" />
                <input
                  value={selected ? displayName(selected) : query}
                  onChange={e => searchProfiles(e.target.value)}
                  autoFocus
                  placeholder="Find by name or phone"
                  className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
                />
                {selected && (
                  <button
                    type="button"
                    onClick={() => searchProfiles('')}
                    aria-label="Clear selection"
                    className="rounded p-0.5 text-gray-500 hover:bg-gray-800 hover:text-white"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              {(searching || hits.length > 0 || query.trim().length >= 2) && !selected && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-800 bg-gray-950 shadow-2xl">
                  {searching && <p className="px-3 py-2 text-xs text-gray-500">Searching…</p>}
                  {!searching && hits.length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-500">No match (or already added)</p>
                  )}
                  {hits.map(hit => (
                    <button
                      key={hit.id}
                      type="button"
                      onClick={() => {
                        setSelected(hit);
                        setHits([]);
                      }}
                      className="block w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-900"
                    >
                      <span className="font-semibold text-white">{displayName(hit)}</span>
                      {hit.phone && <span className="ml-2 text-gray-500">{hit.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <SegmentedChoice value={role} options={ROLE_OPTIONS} onChange={setRole} ariaLabel="School access role" />
            <button
              type="button"
              onClick={addMember}
              disabled={!selected || busy === 'add'}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
            >
              {busy === 'add' ? <Loader2 size={14} className="animate-spin" /> : <UserRoundPlus size={14} />}
              Add
            </button>
            <button
              type="button"
              onClick={closeComposer}
              aria-label="Cancel"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-800 px-3 text-gray-400 hover:bg-gray-900 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {members.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-gray-500">No staff yet. Grant access to a teacher or scorer.</p>
      ) : (
        <ul className="divide-y divide-sky-900/30">
          {members.map((member, idx) => {
            const name = displayName(member.profile);
            const initials = name
              .split(/\s+/)
              .map(w => w[0])
              .slice(0, 2)
              .join('')
              .toUpperCase() || 'U';
            const tone = AVATAR_TONES[idx % AVATAR_TONES.length];
            const isAdmin = member.role === 'admin';
            return (
              <li
                key={member.id}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-sky-950/20"
              >
                <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 ${tone}`}>
                  {initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{name}</p>
                  <p className="truncate text-[11px] text-gray-500">{member.profile?.phone ?? 'No phone'}</p>
                </div>
                {isAdmin ? (
                  <span className="inline-flex h-8 shrink-0 items-center rounded-lg border border-amber-900/70 bg-amber-950/30 px-2.5 text-[11px] font-semibold text-amber-200">
                    Admin
                  </span>
                ) : (
                  <div className="shrink-0">
                    <SegmentedChoice
                      value={member.role === 'teacher' ? 'teacher' : 'scorer'}
                      options={ROLE_OPTIONS}
                      onChange={nextRole => updateRole(member.id, nextRole)}
                      ariaLabel={`Access for ${name}`}
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeMember(member.id)}
                  disabled={isAdmin || busy === member.id}
                  aria-label={`Remove ${name}`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-red-950/30 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                >
                  {busy === member.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function displayName(profile: ProfileHit | Member['profile'] | null | undefined) {
  return profile?.name?.trim() || 'Unnamed user';
}
