'use client';

import { useState } from 'react';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Shared "find or create a player" UI used everywhere a roster needs to grow:
 * tournament team rosters, team detail page, future match scorers.
 *
 * Behaviour:
 *  • Single text field — typing digits searches by phone, anything else by name.
 *  • Live results appear inline; tap one to add.
 *  • If no result, "Add new player" form takes over (name + phone). Creates a
 *    placeholder auth user via `/api/auth/create-placeholder-player`. Phone is
 *    deduped server-side — if a player already exists with that phone, the
 *    endpoint returns the existing id (no duplicate created).
 *  • The actual "what to do with the picked player_id" is delegated to the
 *    parent via `onAdd(playerId, displayName)`. Parent decides which table to
 *    insert into (team_members, tournament_team_players, etc).
 *
 * Why this exists:
 *   The same flow used to live in 3+ places (TournamentTabsClient,
 *   matches/new, match scorers, team AddPlayerForm) with slight variations —
 *   one searched name only, one had stub UX, etc. Centralising means search
 *   improvements (sort, ranking, recent players) ship to every entry point at
 *   once, and the phone-uniqueness rule can't drift across components.
 */

export type PlayerHit = { id: string; name: string; phone: string | null };

/**
 * Returned by the parent's `onAdd` callback.
 *  - `{ ok: true }` — clean success; modal/state resets, onSuccess fires.
 *  - `{ ok: true, warning }` — primary action succeeded but a side-effect
 *    didn't (e.g., team add succeeded but tournament propagation hit a
 *    constraint). Modal still resets, onSuccess fires, but warning is
 *    surfaced briefly.
 *  - `{ ok: false, error }` — primary action failed; error stays visible,
 *    user can correct/retry.
 */
export type PlayerAddResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string };

type Props = {
  /** Called when the user picks an existing or creates a new player. Parent
   *  performs the actual association (insert into team_members, etc). Return
   *  `{ ok: false, error }` to surface the message in this component. */
  onAdd: (playerId: string, displayName: string) => Promise<PlayerAddResult>;
  /** When set, this player_id is excluded from search results — used by the
   *  team page to hide players already on the team. Optional. */
  excludePlayerIds?: string[];
  /** Subset of `excludePlayerIds` that counts as "this side" (vs other side).
   *  When a search hit is excluded only because they're already elsewhere, we
   *  show "other side" copy; when they're on this side, "this side" copy. If
   *  omitted, a generic "already in use" line is used. */
  sameSidePlayerIds?: string[];
  /** Compact form (no card) vs. full modal-style. Default 'inline'. */
  variant?: 'inline' | 'card';
  /** Custom placeholder for the search box. */
  placeholder?: string;
  /** Optional headline shown above the search box. */
  heading?: string;
  /** Optional subhead / hint below the heading. */
  hint?: string;
  /** Called when the form successfully adds a player. Use for parent-side
   *  state updates (refresh, close modal, etc). */
  onSuccess?: () => void;
};

export default function PlayerSearchAndAdd({
  onAdd,
  excludePlayerIds = [],
  sameSidePlayerIds,
  variant = 'inline',
  placeholder = 'Search by name or 10-digit phone…',
  heading,
  hint,
  onSuccess,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [busy, setBusy] = useState(false);
  /** Matches the query but are in `excludePlayerIds` — show why they don't appear as pickable rows. */
  const [blockedHits, setBlockedHits] = useState<PlayerHit[]>([]);

  const exclude = new Set(excludePlayerIds);
  const sameSide = new Set(sameSidePlayerIds ?? []);

  /**
   * Open the create form and pre-fill whichever field matches what the user
   * was just typing. If they typed digits, those almost certainly belong in
   * the phone field (not the name) — pasting a 10-digit number into "Player
   * name" was the #1 source of bad-data placeholder profiles.
   */
  function openCreateForm() {
    const term = query.trim();
    setError('');
    setInfo('');
    if (/^\d+$/.test(term)) {
      setNewPhone(term.slice(-10));
      setNewName('');
    } else if (term) {
      setNewName(term);
      setNewPhone('');
    } else {
      setNewName('');
      setNewPhone('');
    }
    setCreating(true);
  }

  function exitCreateForm() {
    setCreating(false);
    setError('');
    setInfo('');
  }

  async function runSearch(q: string) {
    setQuery(q);
    setError('');
    setInfo('');
    if (!q.trim()) {
      setResults([]);
      setBlockedHits([]);
      return;
    }
    setSearching(true);
    const supabase = createClient();
    const term = q.trim();
    const isDigits = /^\d+$/.test(term);
    const { data } = isDigits
      ? await supabase.from('profiles').select('id, name, phone').ilike('phone', `%${term}%`).limit(8)
      : await supabase.from('profiles').select('id, name, phone').ilike('name', `%${term}%`).limit(8);
    const raw = (data ?? []) as PlayerHit[];
    const rows = raw.filter(r => !exclude.has(r.id));
    const blocked = raw.filter(r => exclude.has(r.id));
    setResults(rows);
    setBlockedHits(blocked);
    setSearching(false);
  }

  function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length) return false;
    const sb = new Set(b);
    return a.every(x => sb.has(x));
  }

  function blockedHint(hit: PlayerHit): string {
    const rosterListMode =
      sameSidePlayerIds !== undefined && sameIdSet(excludePlayerIds, sameSidePlayerIds);
    if (rosterListMode && sameSide.has(hit.id)) {
      return 'Already on this team — listed above.';
    }
    if (sameSidePlayerIds === undefined) {
      return 'Already in use for this pick — remove them first or choose someone else.';
    }
    if (sameSide.has(hit.id)) {
      return 'Already on this side — remove the chip above to change.';
    }
    return 'Already on the other side — remove them there first if you want them here.';
  }

  async function handlePick(playerId: string, displayName: string) {
    setError('');
    setInfo('');
    setBusy(true);
    const result = await onAdd(playerId, displayName);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setQuery('');
    setResults([]);
    setBlockedHits([]);
    setNewName('');
    setNewPhone('');
    setCreating(false);
    if (result.warning) {
      // Side-effect didn't fully apply (e.g., one of N tournaments rejected
      // the auto-sync). Surface briefly so the parent's onSuccess can still
      // refresh, but the user sees what didn't go through.
      setInfo(result.warning);
    }
    onSuccess?.();
  }

  async function handleCreate() {
    setError('');
    setInfo('');
    const cleanName = newName.trim();
    const cleanPhone = newPhone.replace(/\D/g, '').slice(-10);
    if (!cleanName) { setError('Enter a name'); return; }
    if (cleanPhone.length !== 10) { setError('Phone must be 10 digits'); return; }

    setBusy(true);
    const res = await fetch('/api/auth/create-placeholder-player', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cleanName, phone: cleanPhone }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string; name?: string; created?: boolean; error?: string;
    };
    if (!res.ok || !body.id) {
      setError(body.error ?? `Could not create player (HTTP ${res.status})`);
      setBusy(false);
      return;
    }
    setBusy(false);

    const resolvedName = body.name ?? cleanName;

    // Existing-player short-circuit: if the dedup'd id is already on the
    // roster the parent told us to exclude, the parent's onAdd would no-op
    // or fail with a confusing "already added" — beat them to it with a
    // clear message that names the existing player so the user knows what
    // happened. They can also pick a different number if they meant a
    // different person.
    if (!body.created && exclude.has(body.id)) {
      setError(`${resolvedName} is already on this roster (we found them by phone, not by the new name).`);
      return;
    }
    if (!body.created) {
      setInfo(`A player with this number already exists — adding ${resolvedName}.`);
    }
    await handlePick(body.id, resolvedName);
  }

  const wrapperClass =
    variant === 'card'
      ? 'bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3'
      : 'flex flex-col gap-3';

  return (
    <div className={wrapperClass}>
      {heading && <h3 className="text-sm font-semibold text-white">{heading}</h3>}
      {hint && <p className="text-[11px] text-gray-500 leading-relaxed">{hint}</p>}

      {!creating && (
        <>
          <input
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={e => runSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            autoFocus
          />
          <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
            {searching && <p className="text-xs text-gray-500">Searching…</p>}
            {results.map(r => (
              <button
                key={r.id}
                type="button"
                disabled={busy}
                onClick={() => handlePick(r.id, r.name)}
                className="text-left text-sm text-white bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2 disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{r.name}</span>
                  {r.phone && <span className="text-[11px] text-gray-500 shrink-0">+91 {r.phone}</span>}
                </div>
              </button>
            ))}
            {!searching &&
              query.trim() &&
              blockedHits.map(r => (
                <div
                  key={r.id}
                  className="rounded-lg border border-amber-800/50 bg-amber-950/25 px-3 py-2 text-left"
                >
                  <div className="text-xs text-amber-100/95">
                    <span className="font-medium">{r.name}</span>
                    {r.phone && (
                      <span className="text-amber-200/80"> · +91 {r.phone}</span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-amber-200/70">{blockedHint(r)}</p>
                </div>
              ))}
            {!searching && query.trim() && results.length === 0 && blockedHits.length === 0 && (
              <button
                type="button"
                onClick={openCreateForm}
                className="text-left text-xs bg-emerald-950/40 hover:bg-emerald-950/60 border border-emerald-800/60 rounded-lg px-3 py-2 text-emerald-300 font-medium flex items-center gap-1.5"
              >
                <UserPlus size={12} className="shrink-0" />
                <span className="truncate">
                  Add &quot;{query.trim()}&quot; as new player
                </span>
              </button>
            )}
          </div>
        </>
      )}

      {creating && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-white">New player</span>
            <button
              type="button"
              onClick={exitCreateForm}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-600 bg-gray-800/90 px-2.5 py-1 text-[11px] font-medium text-emerald-300 hover:border-emerald-600/60 hover:bg-gray-700 active:scale-[0.98] transition-colors"
            >
              <ArrowLeft size={12} strokeWidth={2.5} className="shrink-0" />
              Search
            </button>
          </div>

          <input
            type="text"
            placeholder="Name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            autoFocus
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-emerald-500">
            <span className="px-2.5 text-xs text-gray-400 border-r border-gray-700 py-2 select-none">+91</span>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="10-digit mobile"
              value={newPhone}
              onChange={e => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="flex-1 bg-transparent px-2.5 py-2 text-sm text-white placeholder-gray-500 focus:outline-none"
            />
          </div>

          <p className="text-[10px] text-gray-600 leading-tight">
            Same mobile = existing profile.
          </p>

          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={busy || !newName.trim() || newPhone.length !== 10}
            className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500 transition-colors"
          >
            {busy ? 'Adding…' : 'Add player'}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {info && <p className="text-sm text-emerald-400">{info}</p>}

      {!creating && (
        <button
          type="button"
          onClick={openCreateForm}
          className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 self-start"
        >
          <UserPlus size={12} /> Add new player
        </button>
      )}
    </div>
  );
}
