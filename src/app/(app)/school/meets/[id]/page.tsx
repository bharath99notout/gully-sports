import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Trophy } from 'lucide-react';
import { getSchoolMeet, type SchoolEventResult, type SchoolHouse } from '@/lib/schoolSportsServer';
import EventsList from './EventsList';

type Props = { params: Promise<{ id: string }> };

export default async function SchoolMeetPage({ params }: Props) {
  const { id } = await params;
  const data = await getSchoolMeet(id);
  if (!data || !data.school) notFound();

  const resultsByEvent: Record<string, SchoolEventResult[]> = {};
  for (const result of data.results) {
    const list = resultsByEvent[result.event_id] ?? [];
    list.push(result);
    resultsByEvent[result.event_id] = list;
  }
  const housePoints = buildHousePoints(data.houses, data.results);
  const medals = data.results.filter(result => result.medal);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <Link href="/school" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white">
        <ArrowLeft size={14} /> School
      </Link>

      <header className="flex flex-col gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-400">{data.school.name}</p>
        <h1 className="text-xl font-bold text-white">{data.meet.name}</h1>
        <p className="text-sm text-gray-500">{new Date(data.meet.meet_date).toLocaleDateString('en-IN')}</p>
      </header>

      <section className="grid grid-cols-3 divide-x divide-gray-800 rounded-2xl border border-gray-800 bg-gray-900">
        <StatCell label="Events" value={data.events.length} />
        <StatCell label="Results" value={data.results.filter(r => r.result_value != null).length} />
        <StatCell label="Medals" value={medals.length} />
      </section>

      <section className="rounded-2xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Trophy size={16} className="text-amber-300" />
            House points
          </h2>
        </div>
        {housePoints.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">Points will appear after results are entered.</p>
        ) : (
          <div className="divide-y divide-gray-800">
            {housePoints.map((house, index) => (
              <div key={house.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-950 text-xs font-bold text-gray-300">
                    {index + 1}
                  </span>
                  <p className="text-sm font-semibold text-white">{house.name}</p>
                </div>
                <p className="text-sm font-black tabular-nums text-emerald-300">{house.points}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <EventsList meetId={data.meet.id} events={data.events} resultsByEvent={resultsByEvent} />
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center justify-center px-2 py-3">
      <p className="text-xl font-black tabular-nums text-white sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
    </div>
  );
}

function buildHousePoints(houses: SchoolHouse[], results: SchoolEventResult[]) {
  const byHouse = new Map(houses.map(house => [house.id, { id: house.id, name: house.name, points: 0 }]));
  for (const result of results) {
    const houseId = result.student?.house_id;
    if (!houseId) continue;
    const current = byHouse.get(houseId);
    if (!current) continue;
    current.points += Number(result.points ?? 0);
  }
  return [...byHouse.values()]
    .filter(house => house.points > 0)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}
