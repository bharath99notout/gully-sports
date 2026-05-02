import Link from 'next/link';
import { Trophy, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

const SPORT_EMOJI: Record<string, string> = {
  cricket: '🏏',
  football: '⚽',
  badminton: '🏸',
  table_tennis: '🏓',
};

export default async function TournamentsListPage() {
  const supabase = await createClient();

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name, sport, status, start_date, end_date, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  const live = (tournaments ?? []).filter(t => t.status !== 'completed');
  const past = (tournaments ?? []).filter(t => t.status === 'completed');

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Trophy size={20} className="text-emerald-400" /> Tournaments
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">League format · all sports</p>
        </div>
        <Link
          href="/tournaments/new"
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-medium text-sm flex items-center gap-1.5"
        >
          <Plus size={16} /> New
        </Link>
      </div>

      {live.length === 0 && past.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          <Trophy size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No tournaments yet.</p>
          <Link
            href="/tournaments/new"
            className="inline-block mt-4 text-emerald-400 hover:text-emerald-300 font-medium text-sm"
          >
            Create the first one →
          </Link>
        </div>
      ) : null}

      {live.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Live & Upcoming</h2>
          <div className="flex flex-col gap-2">
            {live.map(t => <TournamentCard key={t.id} t={t} />)}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Completed</h2>
          <div className="flex flex-col gap-2">
            {past.map(t => <TournamentCard key={t.id} t={t} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function TournamentCard({ t }: { t: { id: string; name: string; sport: string; status: string; start_date?: string | null; end_date?: string | null } }) {
  const dates = [t.start_date, t.end_date].filter(Boolean).join(' → ');
  return (
    <Link
      href={`/tournaments/${t.id}`}
      className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-4 flex items-center gap-3 transition-colors"
    >
      <span className="text-2xl shrink-0">{SPORT_EMOJI[t.sport] ?? '🏆'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{t.name}</p>
        <p className="text-[11px] text-gray-500">
          {t.sport.replace('_', ' ')}
          {dates ? ` · ${dates}` : ''}
        </p>
      </div>
      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
        t.status === 'live'      ? 'bg-emerald-500/15 text-emerald-300'
      : t.status === 'completed' ? 'bg-gray-800 text-gray-400'
      :                            'bg-blue-500/10 text-blue-300'
      }`}>
        {t.status}
      </span>
    </Link>
  );
}
