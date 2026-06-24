import Link from 'next/link';
import { ArrowLeft, School } from 'lucide-react';
import SetupSchoolForm from './SetupSchoolForm';

export default function SchoolSetupPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Link href="/school" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white">
        <ArrowLeft size={14} /> School
      </Link>

      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-white">
          <School size={21} className="text-emerald-400" />
          Set up school sports
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-gray-500">
          One internal workspace for your school sports day. No public school leaderboard is created.
        </p>
      </header>

      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <SetupSchoolForm />
      </section>
    </div>
  );
}
