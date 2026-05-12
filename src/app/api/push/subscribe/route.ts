import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * POST /api/push/subscribe
 *   body: { subscription: PushSubscriptionJSON, userAgent?: string }
 *
 * Upserts the user's push subscription row. We key on `endpoint` (unique
 * per device + push service), so re-subscribing from the same device is
 * idempotent.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });

  let body: { subscription?: PushSubscriptionJSON; userAgent?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad JSON' }, { status: 400 });
  }

  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ ok: false, error: 'Invalid subscription' }, { status: 400 });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id:    user.id,
        endpoint:   sub.endpoint,
        p256dh:     sub.keys.p256dh,
        auth:       sub.keys.auth,
        user_agent: body.userAgent ?? null,
        failure_count: 0,
        failed_at: null,
      },
      { onConflict: 'endpoint' },
    );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
