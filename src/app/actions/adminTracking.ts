'use server';

import { headers } from 'next/headers';
import { getServerAuth } from '@/lib/supabase/server';
import { writeAuditEvent } from '@/features/admin/audit';

type LoginMethod = 'last4' | 'email' | 'restored';

export async function recordLoginSuccess(loginMethod: LoginMethod) {
  const { supabase, user } = await getServerAuth();
  if (!user) return;

  const now = new Date().toISOString();
  const userAgent = (await headers()).get('user-agent')?.slice(0, 500) ?? null;

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ last_seen_at: now, last_login_at: now })
    .eq('id', user.id);
  if (profileErr) console.warn('[adminTracking] profile login update failed', profileErr.message);

  const { error: sessionErr } = await supabase
    .from('user_sessions')
    .insert({
      user_id: user.id,
      login_method: loginMethod,
      user_agent: userAgent,
      created_at: now,
    });
  if (sessionErr) console.warn('[adminTracking] session insert failed', sessionErr.message);

  await writeAuditEvent(supabase, {
    actorUserId: user.id,
    eventType: 'login_success',
    entityType: 'profile',
    entityId: user.id,
    metadata: { login_method: loginMethod },
  });
}

export async function recordMatchCreated(matchId: string) {
  const { supabase, user } = await getServerAuth();
  if (!user) return;

  const { data: match } = await supabase
    .from('matches')
    .select('id, sport, team_a_name, team_b_name, created_by')
    .eq('id', matchId)
    .maybeSingle();

  if (!match || match.created_by !== user.id) return;

  await writeAuditEvent(supabase, {
    actorUserId: user.id,
    eventType: 'match_created',
    entityType: 'match',
    entityId: match.id,
    metadata: {
      sport: match.sport,
      team_a_name: match.team_a_name,
      team_b_name: match.team_b_name,
    },
  });
}
