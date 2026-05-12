import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });

  let body: { endpoint?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Bad JSON' }, { status: 400 }); }
  if (!body.endpoint) return NextResponse.json({ ok: false, error: 'Missing endpoint' }, { status: 400 });

  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', body.endpoint);

  return NextResponse.json({ ok: true });
}
