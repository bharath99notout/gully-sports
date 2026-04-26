import type { SupabaseClient } from '@supabase/supabase-js';
import { toIndiaE164 } from '@/lib/phoneAuth';

/**
 * Find `auth.users.id` for a 10-digit India local number (service-role client).
 * Order: profiles.phone match (prefers admin row), then auth phone E.164, then legacy `{digits}@live.com` email.
 */
export async function findAuthUserIdByPhone10(
  admin: SupabaseClient,
  phone10: string,
): Promise<string | null> {
  const d = phone10.replace(/\D/g, '').slice(-10);
  if (d.length !== 10) return null;
  const e164 = toIndiaE164(d);

  const { data: profRows, error: profErr } = await admin
    .from('profiles')
    .select('id')
    .eq('phone', d)
    .order('is_admin', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (profErr) throw new Error(profErr.message);
  const profId = profRows?.[0]?.id;
  if (profId) return profId;

  let page = 1;
  for (let i = 0; i < 50; i++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find(u => u.phone === e164);
    if (hit) return hit.id;
    if (!data.nextPage) break;
    page = data.nextPage;
  }

  const legacyEmail = `${d}@live.com`.toLowerCase();
  page = 1;
  for (let i = 0; i < 50; i++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find(u => (u.email ?? '').toLowerCase() === legacyEmail);
    if (hit) return hit.id;
    if (!data.nextPage) break;
    page = data.nextPage;
  }

  return null;
}
