import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarPlus } from 'lucide-react';
import NewSchoolMeetForm from './NewSchoolMeetForm';
import { getSchoolWorkspace } from '@/lib/schoolSportsServer';

type Props = { searchParams: Promise<{ schoolId?: string }> };

export default async function NewSchoolMeetPage({ searchParams }: Props) {
  const { schoolId } = await searchParams;
  const { school, canEdit } = await getSchoolWorkspace(schoolId);
  if (!school || !canEdit) notFound();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Link href={`/school?schoolId=${school.id}`} className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white">
        <ArrowLeft size={14} /> School
      </Link>

      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-white">
          <CalendarPlus size={21} className="text-emerald-400" />
          Create school meet
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          This creates class-wise Boys and Girls athletics events like 100m, 200m, high jump, and long jump.
        </p>
      </header>

      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <NewSchoolMeetForm schoolId={school.id} />
      </section>
    </div>
  );
}
