import Link from 'next/link';
import { CalendarPlus, Eye, House, School, UserPlus, Users } from 'lucide-react';
import AddStudentForm from './AddStudentForm';
import SchoolAccessPanel from './SchoolAccessPanel';
import { schoolGenderLabel } from '@/lib/schoolSports';
import { getSchoolWorkspace, schoolRoleLabel, type SchoolMembership } from '@/lib/schoolSportsServer';

type Props = { searchParams: Promise<{ schoolId?: string }> };

export default async function SchoolPage({ searchParams }: Props) {
  const { schoolId } = await searchParams;
  const {
    school,
    role,
    canEdit,
    canManageAccess,
    schoolOptions,
    houses,
    classes,
    students,
    meets,
    members,
    studentsError,
  } = await getSchoolWorkspace(schoolId);

  if (!school) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <header className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <School size={22} className="text-emerald-400" />
            School Sports
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            Manage an internal school sports day with students, houses, events, results, medals, and house points.
          </p>
          <Link
            href="/school/setup"
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Set up school
          </Link>
        </header>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      {schoolOptions.length > 1 && (
        <SchoolSwitcher schools={schoolOptions} selectedSchoolId={school.id} />
      )}

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <School size={22} className="text-emerald-400" />
            {school.name}
          </h1>
          <p className="mt-1.5 inline-flex rounded-full border border-gray-800 bg-gray-900 px-2 py-0.5 text-[11px] font-semibold text-gray-300">
            {schoolRoleLabel(role)} access
          </p>
        </div>
        {canEdit ? (
          <Link
            href={`/school/meets/new?schoolId=${school.id}`}
            className="inline-flex items-center justify-center gap-1.5 self-start rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            <CalendarPlus size={15} />
            New meet
          </Link>
        ) : null}
      </header>

      <section className="grid grid-cols-4 divide-x divide-gray-800 rounded-2xl border border-gray-800 bg-gray-900">
        <StatCell label="Students" value={students.length} />
        <StatCell label="Classes" value={classes.length} />
        <StatCell label="Houses" value={houses.length} />
        <StatCell label="Meets" value={meets.length} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.25fr]">
        {canEdit ? (
          <div className="overflow-hidden rounded-2xl border border-emerald-900/40 bg-gradient-to-b from-emerald-950/20 to-gray-950/60">
            <header className="flex items-center gap-2 border-b border-emerald-900/30 px-4 py-3">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30">
                <UserPlus size={14} />
              </span>
              <h2 className="text-sm font-semibold text-white">Add student</h2>
            </header>
            <div className="p-4">
              <AddStudentForm schoolId={school.id} houses={houses} classes={classes} />
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Eye size={16} className="text-emerald-400" />
              View only
            </h2>
            <p className="mt-1 text-xs text-gray-500">Ask an admin for Edit access to add students or score events.</p>
          </div>
        )}

        <div className="rounded-2xl border border-gray-800 bg-gray-900">
          <div className="border-b border-gray-800 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Users size={16} className="text-emerald-400" />
              Students
            </h2>
          </div>
          {studentsError ? (
            <p className="m-4 rounded-xl border border-red-900/70 bg-red-950/30 px-3 py-2 text-sm text-red-200">
              Could not load students: {studentsError}
            </p>
          ) : students.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">Add students before entering meet results.</p>
          ) : (
            <div className="max-h-[30rem] divide-y divide-gray-800 overflow-auto">
              {students.map(student => (
                <div key={student.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{student.name}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {student.schoolClass?.name || student.class_label || 'No class'} · {schoolGenderLabel(student.gender)}
                      {student.profile_id && <span className="text-emerald-500"> · profile linked</span>}
                    </p>
                  </div>
                  {student.house && (
                    <span className="shrink-0 rounded-full border border-gray-700 px-2 py-1 text-[11px] text-gray-300">
                      {student.house.name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {canManageAccess && <SchoolAccessPanel schoolId={school.id} members={members} />}

      <section className="rounded-2xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <House size={16} className="text-emerald-400" />
            Meets
          </h2>
        </div>
        {meets.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">Create a meet to start registering students for events.</p>
        ) : (
          <div className="divide-y divide-gray-800">
            {meets.map(meet => (
              <Link key={meet.id} href={`/school/meets/${meet.id}`} className="block px-4 py-3 hover:bg-gray-800/60">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{meet.name}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{new Date(meet.meet_date).toLocaleDateString('en-IN')}</p>
                  </div>
                  <span className="rounded-full bg-gray-950 px-2 py-1 text-[11px] text-gray-400">{meet.status}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SchoolSwitcher({
  schools,
  selectedSchoolId,
}: {
  schools: SchoolMembership[];
  selectedSchoolId: string;
}) {
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900 p-3">
      <div className="flex gap-2 overflow-x-auto">
        {schools.map(({ school, role }) => {
          const selected = school.id === selectedSchoolId;
          return (
            <Link
              key={school.id}
              href={`/school?schoolId=${school.id}`}
              className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${
                selected
                  ? 'border-emerald-700 bg-emerald-950/30 text-white'
                  : 'border-gray-800 bg-gray-950 text-gray-400 hover:border-gray-700 hover:text-white'
              }`}
            >
              <span className="block text-sm font-semibold">{school.name}</span>
              <span className="mt-0.5 block text-[11px] text-gray-500">{schoolRoleLabel(role)}</span>
            </Link>
          );
        })}
      </div>
    </section>
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
