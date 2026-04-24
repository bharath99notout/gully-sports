'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Result {
  id: string;
  name: string;
  avatar_url: string | null;
  phone: string | null;
}

export default function PlayerSearchWidget() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // Debounced live search
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      const supabase = createClient();
      // Two parallel queries — name OR phone — merged and de-duplicated.
      const [{ data: byName }, { data: byPhone }] = await Promise.all([
        supabase.from('profiles').select('id, name, avatar_url, phone').ilike('name', `%${q}%`).limit(8),
        supabase.from('profiles').select('id, name, avatar_url, phone').ilike('phone', `%${q}%`).limit(8),
      ]);
      const seen = new Set<string>();
      const combined = [...(byName ?? []), ...(byPhone ?? [])]
        .filter(r => !seen.has(r.id) && !!seen.add(r.id))
        .slice(0, 8);
      setResults(combined as Result[]);
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const showDropdown = open && q.trim().length >= 2;

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 focus-within:border-emerald-700 rounded-xl px-4 py-2.5 transition-colors">
        <Search size={16} className="text-gray-500 shrink-0" />
        <input
          type="text"
          placeholder="Find a player by name or mobile…"
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
        />
        {q.length > 0 && (
          <button onClick={() => { setQ(''); setResults([]); }}
            className="text-gray-600 hover:text-gray-400">
            <X size={14} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-2xl">
          {loading && (
            <p className="px-4 py-3 text-xs text-gray-600">Searching…</p>
          )}
          {!loading && results.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-600">No players found for &ldquo;{q}&rdquo;.</p>
          )}
          {!loading && results.map(p => (
            <Link key={p.id} href={`/players/${p.id}`} onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-800/60 transition-colors border-b border-gray-800/60 last:border-0">
              {p.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatar_url} alt={p.name}
                  className="w-9 h-9 rounded-full object-cover border-2 border-gray-800 shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-sm font-bold text-white border-2 border-gray-800 shrink-0">
                  {p.name[0]?.toUpperCase() ?? '?'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{p.name || 'Unnamed'}</p>
                {p.phone && <p className="text-[11px] text-gray-500 truncate">{p.phone}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
