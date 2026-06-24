'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Medal, Search, X, Activity, Target, Filter } from 'lucide-react';
import {
  formatSchoolResult,
  schoolGenderChipClass,
  schoolGenderLabel,
  schoolMetricLabel,
} from '@/lib/schoolSports';
import type { SchoolEventResult, SchoolMeetEvent } from '@/lib/schoolSportsServer';

type Props = {
  meetId: string;
  events: SchoolMeetEvent[];
  resultsByEvent: Record<string, SchoolEventResult[]>;
};

type TypeFilter = 'all' | 'track' | 'field';
type StatusFilter = 'all' | 'medals' | 'pending';
type GenderFilter = 'all' | 'boys' | 'girls' | 'mixed';

const MEDAL_STYLES: Record<'gold' | 'silver' | 'bronze', { ring: string; bg: string; text: string; label: string }> = {
  gold: { ring: 'ring-amber-400/60', bg: 'bg-amber-500/15', text: 'text-amber-300', label: '1st' },
  silver: { ring: 'ring-slate-300/50', bg: 'bg-slate-400/15', text: 'text-slate-200', label: '2nd' },
  bronze: { ring: 'ring-orange-500/50', bg: 'bg-orange-700/20', text: 'text-orange-300', label: '3rd' },
};

export default function EventsList({ meetId, events, resultsByEvent }: Props) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [classFilter, setClassFilter] = useState<string>('all');

  const classOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const event of events) {
      const key = event.schoolClass?.id ?? event.class_group ?? '__none__';
      const label = event.schoolClass?.name ?? event.class_group ?? 'Other';
      if (!seen.has(key)) seen.set(key, label);
    }
    return [...seen.entries()].map(([key, label]) => ({ key, label }));
  }, [events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter(event => {
      if (typeFilter !== 'all' && event.event_type !== typeFilter) return false;
      if (genderFilter !== 'all' && event.gender_category !== genderFilter) return false;

      if (classFilter !== 'all') {
        const key = event.schoolClass?.id ?? event.class_group ?? '__none__';
        if (key !== classFilter) return false;
      }

      const eventResults = resultsByEvent[event.id] ?? [];
      const hasMedals = eventResults.some(r => r.medal);
      if (statusFilter === 'medals' && !hasMedals) return false;
      if (statusFilter === 'pending' && hasMedals) return false;

      if (q) {
        const hay = [
          event.name,
          event.event_type,
          schoolMetricLabel(event.result_metric),
          schoolGenderLabel(event.gender_category),
          event.schoolClass?.name ?? '',
          event.class_group ?? '',
          ...eventResults.map(r => r.student?.name ?? ''),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, resultsByEvent, query, typeFilter, statusFilter, genderFilter, classFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; events: SchoolMeetEvent[] }>();
    for (const event of filtered) {
      const key = event.schoolClass?.id ?? event.class_group ?? '__none__';
      const label = event.schoolClass?.name ?? event.class_group ?? 'Other';
      const bucket = map.get(key) ?? { label, events: [] };
      bucket.events.push(event);
      map.set(key, bucket);
    }
    return [...map.values()];
  }, [filtered]);

  const totalCount = events.length;
  const shownCount = filtered.length;
  const activeFilters =
    (typeFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (genderFilter !== 'all' ? 1 : 0) +
    (classFilter !== 'all' ? 1 : 0);

  function clearAll() {
    setQuery('');
    setTypeFilter('all');
    setStatusFilter('all');
    setGenderFilter('all');
    setClassFilter('all');
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
      <div className="sticky top-0 z-10 border-b border-gray-800 bg-gray-900/95 backdrop-blur px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Medal size={16} className="text-emerald-400" />
            Events
            <span className="ml-1 rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-semibold text-gray-300">
              {shownCount === totalCount ? totalCount : `${shownCount} / ${totalCount}`}
            </span>
          </h2>
          {(query || activeFilters > 0) && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] font-semibold text-gray-300 hover:bg-gray-700"
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>

        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="search"
            inputMode="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by event, student, or class…"
            className="w-full rounded-xl border border-gray-700 bg-gray-950 py-2.5 pl-9 pr-9 text-sm text-white placeholder:text-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden">
          <Chip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>
            All types
          </Chip>
          <Chip active={typeFilter === 'track'} onClick={() => setTypeFilter('track')} icon={<Activity size={11} />}>
            Track
          </Chip>
          <Chip active={typeFilter === 'field'} onClick={() => setTypeFilter('field')} icon={<Target size={11} />}>
            Field
          </Chip>
          <span className="mx-0.5 w-px shrink-0 bg-gray-800" aria-hidden />
          <Chip active={statusFilter === 'medals'} onClick={() => setStatusFilter(statusFilter === 'medals' ? 'all' : 'medals')}>
            🥇 Has medals
          </Chip>
          <Chip active={statusFilter === 'pending'} onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}>
            Pending
          </Chip>
          <span className="mx-0.5 w-px shrink-0 bg-gray-800" aria-hidden />
          <Chip active={genderFilter === 'boys'} onClick={() => setGenderFilter(genderFilter === 'boys' ? 'all' : 'boys')}>
            Boys
          </Chip>
          <Chip active={genderFilter === 'girls'} onClick={() => setGenderFilter(genderFilter === 'girls' ? 'all' : 'girls')}>
            Girls
          </Chip>
          <Chip active={genderFilter === 'mixed'} onClick={() => setGenderFilter(genderFilter === 'mixed' ? 'all' : 'mixed')}>
            Combined
          </Chip>
        </div>

        {classOptions.length > 1 && (
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden">
            <span className="inline-flex shrink-0 items-center gap-1 pr-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              <Filter size={10} /> Class
            </span>
            <Chip active={classFilter === 'all'} onClick={() => setClassFilter('all')}>
              All
            </Chip>
            {classOptions.map(opt => (
              <Chip key={opt.key} active={classFilter === opt.key} onClick={() => setClassFilter(opt.key)}>
                {opt.label}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
          <Search size={28} className="text-gray-600" />
          <p className="text-sm font-semibold text-gray-300">No events match</p>
          <p className="text-xs text-gray-500">Try different keywords or clear the filters above.</p>
          <button
            onClick={clearAll}
            className="mt-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div>
          {grouped.map(group => (
            <div key={group.label}>
              <div className="sticky top-[1px] z-[1] flex items-center justify-between border-y border-gray-800 bg-gray-950/80 px-4 py-2 backdrop-blur">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-300">{group.label}</p>
                <p className="text-[10px] font-semibold text-gray-500">
                  {group.events.length} event{group.events.length === 1 ? '' : 's'}
                </p>
              </div>
              <ul className="divide-y divide-gray-800">
                {group.events.map(event => {
                  const eventResults = resultsByEvent[event.id] ?? [];
                  const podium = [1, 2, 3]
                    .map(rank => eventResults.find(r => r.rank === rank))
                    .filter(Boolean) as SchoolEventResult[];
                  const hasResults = eventResults.some(r => r.result_value != null);

                  return (
                    <li key={event.id}>
                      <Link
                        href={`/school/meets/${meetId}/events/${event.id}`}
                        className="group flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-gray-800/40 active:bg-gray-800/60"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-semibold leading-tight text-white">{event.name}</p>
                            <p className="mt-0.5 text-[11px] text-gray-500">
                              <span className="capitalize">{event.event_type}</span> · {schoolMetricLabel(event.result_metric)} · {eventResults.length}{' '}
                              {eventResults.length === 1 ? 'participant' : 'participants'}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${schoolGenderChipClass(
                                event.gender_category,
                              )}`}
                            >
                              {schoolGenderLabel(event.gender_category)}
                            </span>
                          </div>
                        </div>

                        {podium.length > 0 ? (
                          <ol className="flex flex-col gap-1.5 sm:flex-row sm:items-stretch sm:gap-2">
                            {podium.map(result => {
                              const medal = result.medal ?? null;
                              const styles = medal ? MEDAL_STYLES[medal] : MEDAL_STYLES.gold;
                              const houseColor = result.student?.house?.color ?? null;
                              return (
                                <li
                                  key={result.id}
                                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 ring-1 ${styles.ring} ${styles.bg}`}
                                >
                                  <span className={`text-[10px] font-bold tabular-nums ${styles.text}`}>{styles.label}</span>
                                  {houseColor && (
                                    <span
                                      className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/30"
                                      style={{ backgroundColor: houseColor }}
                                      aria-hidden
                                    />
                                  )}
                                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">
                                    {result.student?.name ?? 'Unknown'}
                                  </span>
                                  <span className="shrink-0 text-[11px] font-bold tabular-nums text-gray-200">
                                    {formatSchoolResult(result.result_value, event.result_metric)}
                                  </span>
                                </li>
                              );
                            })}
                          </ol>
                        ) : hasResults ? (
                          <p className="rounded-lg border border-dashed border-gray-700 bg-gray-950/60 px-2.5 py-1.5 text-[11px] text-gray-500">
                            Results recorded — no medals assigned yet
                          </p>
                        ) : (
                          <p className="rounded-lg border border-dashed border-gray-800 bg-gray-950/40 px-2.5 py-1.5 text-[11px] text-gray-500">
                            No results entered yet · tap to add
                          </p>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Chip({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        active
          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200'
          : 'border-gray-700 bg-gray-950 text-gray-400 hover:border-gray-600 hover:text-gray-200'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
