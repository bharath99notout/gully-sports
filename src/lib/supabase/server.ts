import { cache } from 'react';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { User } from '@supabase/supabase-js';

const createClientImpl = async (): Promise<SupabaseClient> => {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
};

/**
 * One cookie-bound Supabase client per React server request. Multiple
 * `createClient()` imports in layout + page + lib helpers dedupe here, which
 * cuts redundant cookie reads and keeps the SSR client singleton-shaped.
 */
export const createClient = cache(createClientImpl);

/**
 * One `auth.getUser()` per server request when layout + page both need the
 * signed-in user — avoids duplicate Supabase round-trips (major TTFB win).
 */
export const getServerAuth = cache(async (): Promise<{
  supabase: SupabaseClient;
  user: User | null;
}> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
});
