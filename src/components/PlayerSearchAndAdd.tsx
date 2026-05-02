'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
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

export type PlayerAddResult = { ok: true } | { ok: false; error: string };

type Props = {
  /** Called when the user picks an existing or creates a new player. Parent
   *  performs the actual association (insert into team_members, etc). Return
   *  `{ ok: false, error }` to surface the message in this component. */
  onAdd: (playerId: string, displayName: string) => Promise<PlayerAddResult>;
  /** When set, this player_id is excluded from search results — used by the
   *  team page to hide players already on the team. Optional. */
  excludePlayerIds?: string[];
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

  const exclude = new Set(excludePlayerIds);

  async function runSearch(q: string) {
    setQuery(q);
    setError('');
    setInfo('');
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    const supabase = createClient();
    const term = q.trim();
    const isDigits = /^\d+$/.test(term);
    const { data } = isDigits
      ? await supabase.from('profiles').select('id, name, phone').ilike('phone', `%${term}%`).limit(8)
      : await supabase.from('profiles').select('id, name, phone').ilike('name', `%${term}%`).limit(8);
    const rows = ((data ?? []) as PlayerHit[]).filter(r => !exclude.has(r.id));
    setResults(rows);
    setSearching(false);
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
    setNewName('');
    setNewPhone('');
    setCreating(false);
    onSuccess?.();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
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
    if (!body.created) {
      setInfo(`A player with this number already exists — adding ${body.name ?? cleanName}.`);
    }
    await handlePick(body.id, body.name ?? cleanName);
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
            {!searching && query.trim() && results.length === 0 && (
              <p className="text-xs text-gray-500">No match. Use &quot;Add new player&quot; below.</p>
            )}
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
          </div>
        </>
      )}

      {creating && (
        <form onSubmit={handleCreate} className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="Player name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            autoFocus
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            required
          />
          <div className="flex items-center bg-gray-800 border border-gray-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500">
            <span className="px-3 text-sm text-gray-400 border-r border-gray-700 py-2.5 select-none">+91</span>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="10-digit mobile"
              value={newPhone}
              onChange={e => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none"
              required
            />
          </div>
          <p className="text-[11px] text-gray-600">
            If a player with this phone already exists, we&apos;ll add them instead of creating a duplicate.
          </p>
          <div className="flex items-center gap-3 text-sm">
            <button
              type="submit"
              disabled={busy || !newName.trim() || newPhone.length !== 10}
              className="text-emerald-400 hover:text-emerald-300 disabled:text-gray-600 font-medium"
            >
              {busy ? 'Adding…' : 'Add player'}
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setError(''); setInfo(''); }}
              className="text-gray-500 hover:text-gray-300"
            >
              Back to search
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {info && <p className="text-sm text-emerald-400">{info}</p>}

      {!creating && (
        <button
          type="button"
          onClick={() => { setCreating(true); setError(''); setInfo(''); }}
          className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 self-start"
        >
          <UserPlus size={12} /> Add new player
        </button>
      )}
    </div>
  );
}
