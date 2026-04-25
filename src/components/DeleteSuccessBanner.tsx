import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

/**
 * Shown after an admin deletes a match (`?deleted=1` on the destination URL).
 * Dismiss link strips the query param so the banner does not persist on refresh.
 */
export default function DeleteSuccessBanner({ dismissHref }: { dismissHref: string }) {
  return (
    <div
      role="status"
      className="rounded-xl border border-emerald-700/80 bg-emerald-950/50 px-4 py-3 flex items-start gap-3"
    >
      <CheckCircle2 size={22} className="text-emerald-400 shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-emerald-100">Match deleted successfully</p>
        <p className="text-xs text-emerald-300/90 mt-1 leading-relaxed">
          All scores, player stats, confirmations, and related records for that match were removed from the database.
        </p>
      </div>
      <Link
        href={dismissHref}
        className="text-xs font-medium text-emerald-300 hover:text-white shrink-0 pt-0.5"
      >
        Dismiss
      </Link>
    </div>
  );
}
