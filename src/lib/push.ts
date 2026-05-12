import webpush from 'web-push';
import { createClient } from './supabase/server';

/**
 * Web Push send helper.
 *
 * VAPID identifies us to push services (FCM, Mozilla, Apple). Keys are
 * generated once with `npx web-push generate-vapid-keys` and stored as
 * env vars:
 *
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  (exposed to client, used in subscribe flow)
 *   VAPID_PRIVATE_KEY             (server-only)
 *   VAPID_SUBJECT                 (mailto: or https:// URL for abuse contact)
 *
 * Locally, set them in .env.local. On Vercel, set them on the project's
 * Environment Variables page for Production + Preview + Development.
 */

let configured = false;
function configureVapid() {
  if (configured) return;
  const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sub  = process.env.VAPID_SUBJECT ?? 'mailto:bharathhandady@gmail.com';
  if (!pub || !priv) {
    throw new Error(
      'VAPID keys missing. Run `npx web-push generate-vapid-keys` and set ' +
      'NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY in env.',
    );
  }
  webpush.setVapidDetails(sub, pub, priv);
  configured = true;
}

export interface NotificationPayload {
  title: string;
  body: string;
  /** Relative URL the notification deep-links to when tapped. */
  url?: string;
  /** Tag used by the service worker to coalesce duplicate notifications. */
  tag?: string;
  /** Icon URL — defaults to /icon-192. */
  icon?: string;
}

/**
 * Send a push to all subscriptions belonging to a single user. Failed
 * deliveries are tagged on the row; rows with 3+ consecutive failures
 * are deleted (the endpoint has clearly gone away).
 */
export async function sendToUser(
  userId: string,
  payload: NotificationPayload,
): Promise<{ sent: number; failed: number }> {
  configureVapid();
  const supabase = await createClient();

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, failure_count')
    .eq('user_id', userId);
  if (!subs || subs.length === 0) return { sent: 0, failed: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body:  payload.body,
    url:   payload.url ?? '/',
    tag:   payload.tag,
    icon:  payload.icon ?? '/icon-192',
  });

  let sent = 0, failed = 0;
  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
      );
      sent += 1;
      if (sub.failure_count > 0) {
        await supabase.from('push_subscriptions')
          .update({ failure_count: 0, failed_at: null })
          .eq('id', sub.id);
      }
    } catch (err) {
      failed += 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statusCode = (err as any)?.statusCode;
      // 404/410 = endpoint dead; delete immediately.
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      } else {
        const nextCount = sub.failure_count + 1;
        if (nextCount >= 3) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          await supabase.from('push_subscriptions')
            .update({ failure_count: nextCount, failed_at: new Date().toISOString() })
            .eq('id', sub.id);
        }
      }
    }
  }));
  return { sent, failed };
}

/**
 * Fan-out a pickup ping to all opt-in users within radius of the pickup's
 * ground. Filters by:
 *   - profile.pickup_opt_in = true
 *   - profile.pickup_sports contains this pickup's sport (or empty array = all)
 *   - profile.pickup_last_notified_at older than 30 min (rate limit)
 *   - within profile.pickup_radius_km of the pickup ground (Haversine)
 *   - not in quiet hours (server-evaluated against the user's local clock — we
 *     approximate using Asia/Kolkata since that's the target audience)
 */
export async function fanOutPickupPing(pickupId: string): Promise<{ notified: number }> {
  configureVapid();
  const supabase = await createClient();

  const { data: pickup } = await supabase
    .from('pickup_requests')
    .select(`
      id, host_id, sport, ground_name, ground_lat, ground_lng,
      slots_total, start_time, status,
      host:profiles!pickup_requests_host_id_fkey(name)
    `)
    .eq('id', pickupId)
    .single();
  if (!pickup || pickup.status !== 'open') return { notified: 0 };

  // Pull every opt-in user (cheap; we expect < few thousand).
  // Cron-driven sweep at scale would partition this further.
  const { data: candidates } = await supabase
    .from('profiles')
    .select('id, pickup_radius_km, pickup_sports, pickup_quiet_start, pickup_quiet_end, pickup_last_notified_at')
    .eq('pickup_opt_in', true)
    .neq('id', pickup.host_id);
  if (!candidates) return { notified: 0 };

  const now = Date.now();
  const istHour = Number(
    new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' })
      .format(new Date()),
  );

  const recipients: string[] = [];
  for (const c of candidates) {
    // Sport filter (empty array = all sports)
    if (Array.isArray(c.pickup_sports) && c.pickup_sports.length > 0
        && !c.pickup_sports.includes(pickup.sport)) continue;

    // Rate limit: 30 min between pings
    if (c.pickup_last_notified_at
        && now - new Date(c.pickup_last_notified_at).getTime() < 30 * 60 * 1000) continue;

    // Quiet hours
    if (inQuietHours(istHour, c.pickup_quiet_start, c.pickup_quiet_end)) continue;

    // Get viewer's home lat/lng — we don't store that yet, so for V1 we
    // skip the radius filter on send-time. The dashboard rail still filters
    // by viewer's live GPS, so the user only "sees" pings within range.
    // Future: store last-known lat/lng on profile for true server-side radius.

    recipients.push(c.id);
  }

  // Stamp rate-limit timestamp to limit duplicate pings.
  if (recipients.length > 0) {
    await supabase.from('profiles')
      .update({ pickup_last_notified_at: new Date().toISOString() })
      .in('id', recipients);
  }

  const hostName =
    (Array.isArray(pickup.host) ? pickup.host[0]?.name : (pickup.host as { name?: string } | null)?.name)
    ?? 'A player';
  const sportEmoji = ({
    cricket: '🏏', football: '⚽', badminton: '🏸', table_tennis: '🏓', foosball: '🥅',
  } as Record<string, string>)[pickup.sport] ?? '🎯';

  const slotsLabel = pickup.slots_total === 1 ? '1 player' : `${pickup.slots_total} players`;
  const payload: NotificationPayload = {
    title: `${sportEmoji} ${hostName} needs ${slotsLabel}`,
    body:  `${pickup.ground_name} — tap to view`,
    url:   `/pickups/${pickupId}`,
    tag:   `pickup-${pickupId}`,
  };

  let notified = 0;
  // Fire pushes in parallel; per-user wrapper handles failures.
  await Promise.all(recipients.map(async uid => {
    const res = await sendToUser(uid, payload);
    if (res.sent > 0) notified += 1;
  }));
  return { notified };
}

function inQuietHours(hourNow: number, qStart: string, qEnd: string): boolean {
  // "22:00" / "07:00" — we only care about the hour
  const s = parseInt(qStart.split(':')[0], 10);
  const e = parseInt(qEnd.split(':')[0], 10);
  if (s === e) return false;
  return s < e
    ? hourNow >= s && hourNow < e
    : hourNow >= s || hourNow < e;   // wraps midnight
}
