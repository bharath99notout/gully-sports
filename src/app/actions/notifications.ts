'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null as null, error: 'Not signed in' };
  return { supabase, user, error: null };
}

/** Form action: hidden input `notificationId` */
export async function markNotificationRead(formData: FormData): Promise<void> {
  const raw = formData.get('notificationId');
  const notificationId = typeof raw === 'string' ? raw : '';
  if (!notificationId) return;

  const { supabase, user, error } = await requireUser();
  if (error || !user) return;

  const { error: updErr } = await supabase
    .from('user_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', user.id)
    .is('read_at', null);

  if (updErr) {
    console.warn('[markNotificationRead]', updErr.message);
    return;
  }

  revalidatePath('/notifications');
  revalidatePath('/', 'layout');
}

export async function markAllNotificationsRead(_formData?: FormData): Promise<void> {
  const { supabase, user, error } = await requireUser();
  if (error || !user) return;

  const { error: updErr } = await supabase
    .from('user_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null);

  if (updErr) {
    console.warn('[markAllNotificationsRead]', updErr.message);
    return;
  }

  revalidatePath('/notifications');
  revalidatePath('/', 'layout');
}
