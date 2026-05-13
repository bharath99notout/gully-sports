import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getServerAuth } from '@/lib/supabase/server';
import NewEventForm from './NewEventForm';

export default async function NewEventPage() {
  const { user } = await getServerAuth();
  if (!user) redirect('/auth/login?next=/events/new');

  return (
    <div className="max-w-lg mx-auto flex flex-col gap-5">
      <Link href="/events" className="text-xs text-gray-500 hover:text-gray-300 inline-flex items-center gap-1 self-start">
        <ArrowLeft size={12} /> Events
      </Link>
      <h1 className="text-xl font-bold text-white">New event</h1>
      <NewEventForm />
    </div>
  );
}
