import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPlayerCardPage } from '@/lib/playerCardsServer';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ items: [] }, { status: 401 });
  }

  const url = new URL(req.url);
  const page = url.searchParams.get('page');
  const playerPage = await getPlayerCardPage({ supabase, page });

  return NextResponse.json(playerPage);
}
