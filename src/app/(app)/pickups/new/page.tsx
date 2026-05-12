import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import NewPickupForm from './NewPickupForm';

export const metadata = {
  title: 'Need Players Now – GullySports',
  description: 'Post a real-time pickup request to nearby players.',
};

export default async function NewPickupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?next=/pickups/new');
  return <NewPickupForm />;
}
