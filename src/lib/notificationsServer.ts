import 'server-only';
import { createClient } from './supabase/server';

export interface UserNotificationRow {
  id: string;
  user_id: string;
  match_id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('user_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) {
    console.warn('[getUnreadNotificationCount]', error.message);
    return 0;
  }
  return count ?? 0;
}

export async function listNotificationsForUser(userId: string): Promise<UserNotificationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_notifications')
    .select('id, user_id, match_id, title, body, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    console.warn('[listNotificationsForUser]', error.message);
    return [];
  }
  return (data ?? []) as UserNotificationRow[];
}
