import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, Inbox } from 'lucide-react';
import ConfirmationBadge from '@/components/ConfirmationBadge';
import DeleteSuccessBanner from '@/components/DeleteSuccessBanner';
import AdminMatchActions from './AdminMatchActions';
import type { ConfirmationState } from '@/lib/matchConfirmation';

/**
 * Admin queue for trust review.
 *
 * Shows two buckets:
 *   1. Force-pushed (highest priority — scorer insists, dispute unresolved)
 *   2. Stuck disputed (>24h with no scorer recheck or force-push)
 *
 * Why both: a scorer may walk away from a dispute without force-pushing.
 * The bucket-2 list lets admins clean those up too.
 */
export default async function AdminMatchQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { deleted } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: me } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!me?.is_admin) notFound();

  // Bucket 1: force-pushed
  const { data: forcePushed } = await supabase
    .from('matches')
    .select('id, sport, status, team_a_name, team_b_name, played_at, scored_by, created_by, confirmation_state')
    .eq('confirmation_state', 'force_pushed')
    .order('played_at', { ascending: false });

  // Bucket 2: stuck disputed (>24h since auto_confirm_at lapsed)
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: stuckDisputed } = await supabase
    .from('matches')
    .select('id, sport, status, team_a_name, team_b_name, played_at, scored_by, created_by, confirmation_state')
    .eq('confirmation_state', 'disputed')
    .lt('played_at', dayAgo)
    .order('played_at', { ascending: false });

  const allRows = [...(forcePushed ?? []), ...(stuckDisputed ?? [])];
  const matchIds = allRows.map(r => r.id);

  // Pull dispute reasons + scorer names + participant lists in parallel
  const [{ data: confs }, { data: scorers }, { data: participants }] = await Promise.all([
    matchIds.length
      ? supabase.from('match_confirmations').select('match_id, player_id, status, disputed_reason').in('match_id', matchIds)
      : Promise.resolve({ data: [] as Array<{ match_id: string; player_id: string; status: string; disputed_reason: string | null }> }),
    matchIds.length
      ? supabase.from('matches').select('id, scored_by, created_by').in('id', matchIds)
      : Promise.resolve({ data: [] as Array<{ id: string; scored_by: string | null; created_by: string | null }> }),
    matchIds.length
      ? supabase.from('match_players').select('match_id, player_id, team_name, profiles(name)').in('match_id', matchIds)
      : Promise.resolve({ data: [] as Array<{ match_id: string; player_id: string; team_name: string; profiles: { name: string } | null }> }),
  ]);

  const allUserIds = new Set<string>();
  for (const s of scorers ?? []) {
    if (s.scored_by) allUserIds.add(s.scored_by);
    if (s.created_by) allUserIds.add(s.created_by);
  }
  const { data: userProfiles } = allUserIds.size
    ? await supabase.from('profiles').select('id, name').in('id', Array.from(allUserIds))
    : { data: [] as Array<{ id: string; name: string }> };
  const nameById = new Map((userProfiles ?? []).map(p => [p.id, p.name]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partsByMatch = new Map<string, Array<{ player_id: string; name: string; team_name: string; status: string; reason: string | null }>>();
  for (const m of matchIds) partsByMatch.set(m, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (participants ?? []) as any[]) {
    const conf = (confs ?? []).find(c => c.match_id === p.match_id && c.player_id === p.player_id);
    partsByMatch.get(p.match_id)?.push({
      player_id: p.player_id,
      name: p.profiles?.name ?? 'Unknown',
      team_name: p.team_name,
      status: conf?.status ?? 'pending',
      reason: conf?.disputed_reason ?? null,
    });
  }

  const renderRow = (row: typeof allRows[number]) => {
    const scorerId = row.scored_by ?? row.created_by;
    const scorerName = scorerId ? nameById.get(scorerId) ?? '—' : '—';
    const parts = partsByMatch.get(row.id) ?? [];
    const disputers = parts.filter(p => p.status === 'disputed');

    return (
      <div key={row.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/matches/${row.id}`} className="text-sm font-semibold text-white hover:text-emerald-400 truncate">
                {row.team_a_name} vs {row.team_b_name}
              </Link>
              <ConfirmationBadge state={row.confirmation_state as ConfirmationState} compact />
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {row.sport} · scorer: <span className="text-gray-300">{scorerName}</span>
              {' · '}
              {new Date(row.played_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {disputers.length > 0 && (
          <div className="bg-red-950/30 border border-red-900/60 rounded-lg p-2.5 text-xs">
            <p className="text-red-400 font-semibold mb-1">Disputed by:</p>
            {disputers.map(d => (
              <div key={d.player_id} className="text-gray-300">
                <span className="font-semibold">{d.name}</span>
                {d.reason && <span className="text-gray-500"> — &quot;{d.reason}&quot;</span>}
              </div>
            ))}
          </div>
        )}

        <AdminMatchActions matchId={row.id} allowFullDelete={row.status === 'completed'} />
      </div>
    );
  };

  const totalCount = allRows.length;

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      {deleted === '1' && <DeleteSuccessBanner dismissHref="/admin/matches" />}

      <div>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={20} className="text-emerald-400" />
          <h1 className="text-xl font-bold text-white">Admin · Match Queue</h1>
        </div>
        <p className="text-sm text-gray-500">
          Force-pushed and stuck-disputed matches. Approve to keep stats, reject to remove them entirely.
        </p>
      </div>

      {totalCount === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col items-center text-center gap-2">
          <Inbox size={32} className="text-gray-600" />
          <p className="text-sm text-gray-400">All clear. Nothing needs admin attention right now.</p>
        </div>
      ) : (
        <>
          {(forcePushed ?? []).length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2">
                Force-pushed by scorer ({forcePushed!.length})
              </h2>
              <div className="flex flex-col gap-3">
                {(forcePushed ?? []).map(renderRow)}
              </div>
            </section>
          )}

          {(stuckDisputed ?? []).length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-2">
                Stuck disputed (&gt; 24h, no scorer response) ({stuckDisputed!.length})
              </h2>
              <div className="flex flex-col gap-3">
                {(stuckDisputed ?? []).map(renderRow)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
