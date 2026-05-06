import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getEvent } from '@/lib/eventsServer';
import NewEventForm from '../../new/NewEventForm';

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=/events/${id}/edit`);

  const event = await getEvent(id);
  if (!event) notFound();
  if (event.host_id !== user.id) {
    // Not the host — bounce them back to the read-only detail page rather
    // than a 403 page. RLS would block any write attempts anyway.
    redirect(`/events/${id}`);
  }

  return (
    <div className="max-w-lg mx-auto flex flex-col gap-5">
      <Link
        href={`/events/${id}`}
        className="text-xs text-gray-500 hover:text-gray-300 inline-flex items-center gap-1 self-start"
      >
        <ArrowLeft size={12} /> Back to event
      </Link>
      <h1 className="text-xl font-bold text-white">Edit event</h1>
      <NewEventForm existing={event} />
    </div>
  );
}
