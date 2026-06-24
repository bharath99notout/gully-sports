import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Timer } from 'lucide-react';
import { schoolGenderChipClass, schoolGenderLabel, schoolMetricLabel } from '@/lib/schoolSports';
import { getSchoolEvent } from '@/lib/schoolSportsServer';
import SchoolEventResultsClient from './SchoolEventResultsClient';

type Props = { params: Promise<{ id: string; eventId: string }> };

export default async function SchoolEventPage({ params }: Props) {
  const { id, eventId } = await params;
  const data = await getSchoolEvent(eventId);
  if (!data || !data.school || !data.meet || data.meet.id !== id) notFound();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <Link href={`/school/meets/${id}`} className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white">
        <ArrowLeft size={14} /> {data.meet.name}
      </Link>

      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-400">{data.school.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Timer size={21} className="text-emerald-400" />
            {data.event.name}
          </h1>
          {(data.event.schoolClass?.name || data.event.class_group) && (
            <span className="rounded-full border border-gray-700 bg-gray-950 px-2 py-0.5 text-[10px] font-semibold text-gray-300">
              {data.event.schoolClass?.name || data.event.class_group}
            </span>
          )}
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${schoolGenderChipClass(data.event.gender_category)}`}>
            {schoolGenderLabel(data.event.gender_category)}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {data.event.event_type} · {schoolMetricLabel(data.event.result_metric)} · {data.results.length} participants
        </p>
      </header>

      <SchoolEventResultsClient
        eventId={data.event.id}
        eventCategory={data.event.gender_category}
        metric={data.event.result_metric}
        students={data.students}
        results={data.results}
        studentsError={data.studentsError}
        canEdit={data.canEdit}
      />
    </div>
  );
}
