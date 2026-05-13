import { ShieldCheck, ShieldAlert, ShieldQuestion, Star } from 'lucide-react';
import type { PlayerTrustScore } from '@/lib/trustScore';
import { getTrustTone } from '@/lib/trustScore';

function TrustIcon({ score, size }: { score: number; size: number }) {
  if (score >= 75) return <ShieldCheck size={size} />;
  if (score >= 40) return <ShieldQuestion size={size} />;
  return <ShieldAlert size={size} />;
}

export function TrustScoreChip({
  trustScore,
  className = '',
}: {
  trustScore: PlayerTrustScore;
  className?: string;
}) {
  const tone = getTrustTone(trustScore.score);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone.bg} ${tone.border} ${tone.text} ${className}`}>
      <TrustIcon score={trustScore.score} size={12} />
      Trust {trustScore.score}
    </span>
  );
}

export default function TrustScoreBadge({
  trustScore,
  compact = false,
}: {
  trustScore: PlayerTrustScore;
  compact?: boolean;
}) {
  const tone = getTrustTone(trustScore.score);

  if (compact) {
    return (
      <div className={`rounded-xl border px-3 py-2 ${tone.bg} ${tone.border}`}>
        <div className="flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${tone.text}`}>
            <TrustIcon score={trustScore.score} size={14} /> Trust
          </span>
          <span className={`text-lg font-black tabular-nums ${tone.text}`}>{trustScore.score}</span>
        </div>
        <p className="text-[11px] text-gray-400 truncate">
          {trustScore.tier}
        </p>
      </div>
    );
  }

  return (
    <section className={`rounded-2xl border p-4 ${tone.bg} ${tone.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${tone.text}`}>
            <TrustIcon score={trustScore.score} size={15} /> Trust Score
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-white">{trustScore.tier}</h2>
          <p className="mt-1 text-xs text-gray-400">
            Based on attendance, cancellations, payments, peer ratings, and verified match history.
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-4xl font-black tabular-nums leading-none ${tone.text}`}>
            {trustScore.score}
          </p>
          <p className="text-[10px] text-gray-500 mt-1">out of 100</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Signal label="Attendance" value={trustScore.attendance_score} tone={tone.bar} />
        <Signal label="Cancel" value={trustScore.cancellation_score} tone={tone.bar} />
        <Signal label="Payment" value={trustScore.payment_score} tone={tone.bar} />
        <Signal label="Peers" value={trustScore.peer_score} tone={tone.bar} />
        <Signal label="Skill" value={trustScore.skill_score} tone={tone.bar} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-gray-400">
        <span className="rounded-full bg-gray-950/45 border border-gray-800 px-2 py-1">
          {trustScore.matches_counted} confirmed match{trustScore.matches_counted === 1 ? '' : 'es'}
        </span>
        <span className="rounded-full bg-gray-950/45 border border-gray-800 px-2 py-1">
          {trustScore.no_shows} no-show{trustScore.no_shows === 1 ? '' : 's'}
        </span>
        <span className="rounded-full bg-gray-950/45 border border-gray-800 px-2 py-1">
          {trustScore.payment_assignments} payment record{trustScore.payment_assignments === 1 ? '' : 's'}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-950/45 border border-gray-800 px-2 py-1">
          <Star size={11} /> {trustScore.peer_ratings_count} peer rating{trustScore.peer_ratings_count === 1 ? '' : 's'}
        </span>
      </div>
    </section>
  );
}

function Signal({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="rounded-xl border border-gray-800/80 bg-gray-950/45 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider truncate">{label}</span>
        <span className="text-xs font-bold text-gray-200 tabular-nums">{pct}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
