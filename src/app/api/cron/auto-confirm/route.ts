import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Vercel Cron (see `vercel.json`) — promotes pending matches past
 * `auto_confirm_at` via `sweep_auto_confirms()` so we don't run the sweep on
 * every dashboard request.
 *
 * Set `CRON_SECRET` in Vercel; the platform sends `Authorization: Bearer …`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.rpc('sweep_auto_confirms');
    if (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
