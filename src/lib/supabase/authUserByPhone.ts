import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { toIndiaE164 } from '@/lib/phoneAuth';

/**
 * Find `auth.users.id` for a 10-digit India local number (service-role client).
 * Order: normalized profiles.phone match (prefers admin row), deleted profile
 * phone hash, auth phone E.164, then legacy `{digits}@live.com` email.
 */
export async function findAuthUserIdByPhone10(
  admin: SupabaseClient,
  phone10: string,
): Promise<string | null> {
  const d = phone10.replace(/\D/g, '').slice(-10);
  if (d.length !== 10) return null;
  const e164 = toIndiaE164(d);
  const prefixed = `91${d}`;

  const { data: exactRows, error: exactErr } = await admin
    .from('profiles')
    .select('id, phone, is_admin, created_at')
    .in('phone', [d, e164, prefixed])
    .order('is_admin', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10);

  if (exactErr) throw new Error(exactErr.message);
  let profId = pickProfileId(exactRows, d);
  if (profId) return profId;

  const { data: fuzzyRows, error: fuzzyErr } = await admin
    .from('profiles')
    .select('id, phone, is_admin, created_at')
    .ilike('phone', `%${d.slice(-4)}%`)
    .order('is_admin', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  if (fuzzyErr) throw new Error(fuzzyErr.message);
  profId = pickProfileId(fuzzyRows, d);
  if (profId) return profId;

  const deletedHashVariants = [d, e164, prefixed].map(value =>
    createHash('sha256').update(value, 'utf8').digest('hex'),
  );
  const { data: deletedRows, error: deletedErr } = await admin
    .from('profiles')
    .select('id, is_admin, created_at')
    .in('deleted_phone_hash', deletedHashVariants)
    .not('deleted_at', 'is', null)
    .order('is_admin', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (deletedErr) throw new Error(deletedErr.message);
  const deletedId = deletedRows?.[0]?.id;
  if (deletedId) return deletedId;

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

type ProfilePhoneRow = {
  id: string;
  phone: string | null;
  is_admin?: boolean | null;
  created_at?: string | null;
};

function normalizePhone10(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const normalized = digits.slice(-10);
  return normalized.length === 10 ? normalized : null;
}

function pickProfileId(rows: ProfilePhoneRow[] | null, phone10: string): string | null {
  const matches = (rows ?? []).filter(row => normalizePhone10(row.phone) === phone10);
  matches.sort((a, b) => {
    const adminDelta = Number(Boolean(b.is_admin)) - Number(Boolean(a.is_admin));
    if (adminDelta !== 0) return adminDelta;
    return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
  });
  return matches[0]?.id ?? null;
}
