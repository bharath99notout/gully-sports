'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Link2, Loader2, Search, UserRoundCheck, X } from 'lucide-react';
import { addSchoolStudent } from '@/app/actions/schoolSports';
import { DarkListbox, SegmentedChoice, type ChoiceOption } from '@/components/SchoolFormControls';
import { createClient } from '@/lib/supabase/client';
import type { SchoolGender } from '@/lib/schoolSports';
import type { SchoolClass, SchoolHouse } from '@/lib/schoolSportsServer';

type ProfileHit = { id: string; name: string | null; phone: string | null };

const CATEGORY_OPTIONS: ChoiceOption<SchoolGender>[] = [
  { value: 'boys', label: 'Boys', tone: 'blue' },
  { value: 'girls', label: 'Girls', tone: 'pink' },
];

export default function AddStudentForm({
  schoolId,
  houses,
  classes,
}: {
  schoolId: string;
  houses: SchoolHouse[];
  classes: SchoolClass[];
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [gender, setGender] = useState<SchoolGender>('boys');
  const [houseId, setHouseId] = useState(houses[0]?.id ?? '');
  const [profile, setProfile] = useState<ProfileHit | null>(null);
  const [profileQuery, setProfileQuery] = useState('');
  const [profileHits, setProfileHits] = useState<ProfileHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const houseOptions: ChoiceOption<string>[] = [
    { value: '', label: 'No house' },
    ...houses.map(house => ({ value: house.id, label: house.name })),
  ];
  const classOptions: ChoiceOption<string>[] = classes.map(schoolClass => ({
    value: schoolClass.id,
    label: schoolClass.name,
  }));

  async function searchProfiles(query: string) {
    setProfileQuery(query);
    setProfileHits([]);
    setError('');
    if (query.trim().length < 2) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const supabase = createClient();
    const term = query.trim();
    try {
      const [{ data: byName }, { data: byPhone }] = await Promise.all([
        supabase.from('profiles').select('id, name, phone').ilike('name', `%${term}%`).limit(5),
        supabase.from('profiles').select('id, name, phone').ilike('phone', `%${term}%`).limit(5),
      ]);
      const seen = new Set<string>();
      const hits = [...(byName ?? []), ...(byPhone ?? [])]
        .filter(hit => !seen.has(hit.id) && !!seen.add(hit.id))
        .slice(0, 6);
      setProfileHits(hits as ProfileHit[]);
    } finally {
      setSearching(false);
    }
  }

  function pickProfile(hit: ProfileHit) {
    setProfile(hit);
    setName((hit.name ?? '').trim() || name);
    setProfileQuery('');
    setProfileHits([]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const result = await addSchoolStudent({
      schoolId,
      name,
      classId,
      gender,
      houseId: houseId || null,
      profileId: profile?.id ?? null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setName('');
    setClassId(classes[0]?.id ?? '');
    setGender('boys');
    setProfile(null);
    setShowLink(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5">
      {error && <p className="rounded-lg border border-red-900/70 bg-red-950/30 px-3 py-2 text-xs text-red-200">{error}</p>}

      <input
        value={name}
        onChange={e => setName(e.target.value)}
        required
        placeholder="Student name"
        className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-emerald-700 focus:outline-none"
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <DarkListbox
          value={classId}
          options={classOptions}
          onChange={setClassId}
          placeholder="Class"
          searchable
          searchPlaceholder="Search class..."
          emptyText="No classes configured"
        />
        <DarkListbox value={houseId} options={houseOptions} onChange={setHouseId} placeholder="House" />
      </div>

      <SegmentedChoice value={gender} options={CATEGORY_OPTIONS} onChange={setGender} ariaLabel="Student category" />

      {profile ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-800/70 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          <span className="flex items-center gap-2 truncate">
            <UserRoundCheck size={14} />
            <span className="truncate">{(profile.name ?? '').trim() || 'Linked player'}</span>
            {profile.phone && <span className="text-xs text-emerald-300/70">· {profile.phone}</span>}
          </span>
          <button
            type="button"
            onClick={() => setProfile(null)}
            aria-label="Unlink profile"
            className="rounded p-0.5 text-emerald-300/70 hover:bg-emerald-900/40 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      ) : showLink ? (
        <div className="rounded-xl border border-gray-800 bg-gray-950">
          <div className="flex items-center gap-2 px-3 py-2">
            <Search size={13} className="text-gray-500" />
            <input
              value={profileQuery}
              onChange={e => searchProfiles(e.target.value)}
              placeholder="Find by name or phone"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                setShowLink(false);
                setProfileQuery('');
                setProfileHits([]);
              }}
              aria-label="Cancel link"
              className="rounded p-0.5 text-gray-500 hover:bg-gray-800 hover:text-white"
            >
              <X size={13} />
            </button>
          </div>
          {(searching || profileHits.length > 0 || profileQuery.trim().length >= 2) && (
            <div className="border-t border-gray-800">
              {searching && <p className="px-3 py-2 text-xs text-gray-500">Searching…</p>}
              {!searching && profileQuery.trim().length >= 2 && profileHits.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-500">No profile found</p>
              )}
              {profileHits.map(hit => (
                <button
                  key={hit.id}
                  type="button"
                  onClick={() => pickProfile(hit)}
                  className="block w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-900"
                >
                  <span className="font-semibold text-white">{hit.name || 'Unnamed'}</span>
                  {hit.phone && <span className="ml-2 text-gray-500">{hit.phone}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowLink(true)}
          className="inline-flex items-center gap-1.5 self-start rounded-md px-1 py-0.5 text-[11px] font-semibold text-gray-500 hover:text-emerald-300"
        >
          <Link2 size={11} />
          Link to existing player
          <ChevronDown size={11} />
        </button>
      )}

      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        Add student
      </button>
    </form>
  );
}
