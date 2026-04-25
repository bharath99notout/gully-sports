import Link from 'next/link';
import { ArrowRight, Hourglass, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { PendingMatchSummary } from '@/lib/matchConfirmationServer';

const sportEmoji: Record<string, string> = {
  cricket: '🏏', football: '⚽', badminton: '🏸', table_tennis: '🏓',
};

function formatTimeLeft(autoConfirmAt: string | null): string | null {
  if (!autoConfirmAt) return null;
  const ms = new Date(autoConfirmAt).getTime() - Date.now();
  if (ms <= 0) return 'auto-confirms shortly';
  const hrs = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hrs > 0) return `${hrs}h ${mins}m left`;
  return `${mins}m left`;
}

/**
 * Dashboard banner listing matches that need this user's attention. We keep
 * each row tap-scaled (whole row is a link) and lean on the per-state pill
 * to give the user immediate context.
 *
 * Why no client interactivity here: the dashboard already does a lot of
 * work; tapping through to /matches/[id] is one cheap navigation away and
 * keeps the dashboard render purely server-side.
 */
export default function PendingMatchesSection({ matches }: { matches: PendingMatchSummary[] }) {
  return (
    <section className="bg-amber-950/20 border border-amber-900/50 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Hourglass size={16} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-amber-300">
          Needs your attention ({matches.length})
        </h2>
      </div>

      <div className="flex flex-col gap-2">
        {matches.slice(0, 5).map(m => {
          const timeLeft = m.match_state === 'pending' ? formatTimeLeft(m.auto_confirm_at) : null;
          const Icon = m.match_state === 'force_pushed' ? ShieldAlert
                     : m.match_state === 'disputed'     ? AlertTriangle
                     :                                    Hourglass;
          const iconColor = m.match_state === 'force_pushed' || m.match_state === 'disputed'
                            ? 'text-red-400' : 'text-amber-400';
          const verb = m.my_status === 'disputed' ? 'You disputed'
                     : m.match_state === 'pending' ? 'Confirm or dispute'
                     : 'Open';

          return (
            <Link
              key={m.match_id}
              href={`/matches/${m.match_id}`}
              className="bg-gray-900/60 border border-gray-800 hover:border-amber-700 rounded-xl p-3 flex items-center justify-between gap-3 transition-colors"
            >
              <div className="min-w-0 flex items-center gap-2.5">
                <span className="text-lg shrink-0">{sportEmoji[m.sport] ?? '🏆'}</span>
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium truncate">
                    {m.team_a_name} <span className="text-gray-600">vs</span> {m.team_b_name}
                  </p>
                  <p className="text-[11px] text-gray-500 inline-flex items-center gap-1 mt-0.5">
                    <Icon size={10} className={iconColor} />
                    {verb}
                    {timeLeft && <span className="text-amber-400 ml-1">· {timeLeft}</span>}
                  </p>
                </div>
              </div>
              <ArrowRight size={14} className="text-gray-500 shrink-0" />
            </Link>
          );
        })}
        {matches.length > 5 && (
          <p className="text-[11px] text-gray-500 text-center pt-1">
            and {matches.length - 5} more — open each match to respond
          </p>
        )}
      </div>
    </section>
  );
}
