import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { getServerAuth } from '@/lib/supabase/server';
import { getMyBowlingDeliveries, getBowlingDna, deleteBowlingDelivery } from '@/app/actions/bowlingDeliveries';
import type { BowlingDelivery } from '@/types';

export const metadata = {
  title: 'Bowling DNA — GullySports',
};

function fmtAgo(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1)   return 'just now';
  if (diffMin < 60)  return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default async function BowlingPage() {
  const { user } = await getServerAuth();
  if (!user) redirect('/auth/login?next=/bowling');

  const [deliveries, dna] = await Promise.all([
    getMyBowlingDeliveries(50),
    getBowlingDna(user.id, 10),
  ]);

  const valid    = deliveries.filter(d => !d.speed_is_outlier);
  const outliers = deliveries.filter(d =>  d.speed_is_outlier);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Bowling DNA</h1>
          <p className="text-xs text-gray-500 mt-0.5">Your speed history — private to you.</p>
        </div>
        <Link
          href="/bowling/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-gray-950 text-sm font-bold shrink-0"
        >
          <Plus size={14} /> New
        </Link>
      </div>

      <DnaStrip dna={dna} />

      {valid.length === 0 && outliers.length === 0 ? (
        <Link
          href="/bowling/new"
          className="rounded-2xl border border-dashed border-gray-700 hover:border-emerald-700 bg-gray-900/40 hover:bg-emerald-950/20 px-4 py-8 text-center transition-colors"
        >
          <p className="text-sm text-gray-400">No deliveries yet.</p>
          <p className="text-base font-semibold text-emerald-400 mt-1 inline-flex items-center gap-1">
            <Plus size={14} /> Capture your first
          </p>
        </Link>
      ) : (
        <>
          {valid.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">
                Recent deliveries
              </h2>
              {valid.map(d => <DeliveryRow key={d.id} delivery={d} />)}
            </section>
          )}
          {outliers.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-rose-400">
                Excluded — tap timing looked off
              </h2>
              {outliers.map(d => <DeliveryRow key={d.id} delivery={d} excluded />)}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function DnaStrip({ dna }: { dna: { delivery_count: number; peak_kmh: number | null; rolling_avg_kmh: number | null } }) {
  if (dna.delivery_count === 0) {
    return (
      <div className="rounded-2xl border border-gray-800 bg-gray-900/50 px-4 py-3 text-xs text-gray-500">
        Capture a few deliveries to see your peak and average speed.
      </div>
    );
  }
  return (
    <section className="grid grid-cols-3 divide-x divide-gray-800 rounded-2xl border border-gray-800 bg-gray-900">
      <Stat label="Peak"  value={dna.peak_kmh}        unit="km/h" accent="amber" />
      <Stat label="Avg"   value={dna.rolling_avg_kmh} unit="km/h" accent="emerald" />
      <Stat label="Count" value={dna.delivery_count}  unit={dna.delivery_count === 1 ? 'ball' : 'balls'} accent="sky" />
    </section>
  );
}

function Stat({ label, value, unit, accent }: {
  label: string; value: number | null; unit: string; accent: 'emerald' | 'amber' | 'sky';
}) {
  const tint = accent === 'amber' ? 'text-amber-300' : accent === 'sky' ? 'text-sky-300' : 'text-emerald-300';
  return (
    <div className="flex flex-col items-center py-3 px-2">
      <span className={`text-2xl font-extrabold tabular-nums ${tint}`}>
        {value == null ? '—' : value}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">{unit}</span>
      <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mt-0.5">{label}</span>
    </div>
  );
}

function DeliveryRow({ delivery, excluded }: { delivery: BowlingDelivery; excluded?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 ${
      excluded ? 'border-rose-900/40 bg-rose-950/15' : 'border-gray-800 bg-gray-900'
    }`}>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className={`text-xl font-bold tabular-nums ${excluded ? 'text-rose-300 line-through' : 'text-white'}`}>
          {delivery.speed_kmh.toFixed(1)}
        </span>
        <span className="text-[11px] text-gray-500">km/h</span>
        <span className="text-[11px] text-gray-500 truncate ml-1">
          · {delivery.distance_m.toFixed(2)} m · {delivery.duration_ms} ms
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-gray-500">{fmtAgo(delivery.recorded_at)}</span>
        <form action={async () => { 'use server'; await deleteBowlingDelivery(delivery.id); }}>
          <button
            type="submit"
            className="text-gray-500 hover:text-rose-400 p-1"
            aria-label="Delete delivery"
          >
            <Trash2 size={13} />
          </button>
        </form>
      </div>
    </div>
  );
}
