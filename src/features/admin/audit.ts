import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminAuditEventType } from './types';

export async function writeAuditEvent(
  supabase: SupabaseClient,
  event: {
    actorUserId: string | null;
    eventType: AdminAuditEventType;
    entityType?: string | null;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.from('audit_events').insert({
    actor_user_id: event.actorUserId,
    event_type: event.eventType,
    entity_type: event.entityType ?? null,
    entity_id: event.entityId ?? null,
    metadata: event.metadata ?? {},
  });

  if (error) {
    console.warn('[adminAudit] write failed', error.message);
  }
}
