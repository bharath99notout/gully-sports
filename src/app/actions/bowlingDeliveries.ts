'use server';

import { revalidatePath } from 'next/cache';
import { getServerAuth } from '@/lib/supabase/server';
import type {
  BowlingDelivery, BowlingDna, BowlingPrivacyState, BowlingRecordedVia, BowlingActionClass,
} from '@/types';

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Outlier guardrails per BRD §4 — anything outside this band gets stored
// with speed_is_outlier=true so the user can see the rejected reading but
// it doesn't poison the rolling avg.
const MIN_KMH = 30;
const MAX_KMH = 140;
const MIN_DURATION_MS = 50;   // would imply >1440 km/h at 20m — clearly a misfire
const MAX_DURATION_MS = 4000; // would imply <18 km/h — bowler walked the ball

export async function createBowlingDelivery(input: {
  durationMs: number;
  distanceM: number;
  matchId?: string | null;
  overIndex?: number | null;
  privacyState?: BowlingPrivacyState;
  note?: string | null;
  recordedVia?: BowlingRecordedVia;
  // Optional video-mark metadata
  releaseMs?:    number | null;
  pitchMs?:      number | null;
  armAngleDeg?:  number | null;
  actionClass?:  BowlingActionClass | null;
  thumbnailUrl?: string | null;
}): Promise<ActionResult<{ delivery: BowlingDelivery }>> {
  const { supabase, user } = await getServerAuth();
  if (!user) return { ok: false, error: 'Sign in to record a delivery' };

  const dist = Number(input.distanceM);
  const dur  = Number(input.durationMs);
  if (!Number.isFinite(dist) || dist <= 0) return { ok: false, error: 'Distance must be positive' };
  if (!Number.isFinite(dur)  || dur  <= 0) return { ok: false, error: 'Duration must be positive' };
  if (dur < MIN_DURATION_MS || dur > MAX_DURATION_MS) {
    return { ok: false, error: 'That mark timing looks off — try again' };
  }

  const speedKmh = Math.round(((dist / (dur / 1000)) * 3.6) * 10) / 10;
  const isOutlier = speedKmh < MIN_KMH || speedKmh > MAX_KMH;

  const { data, error } = await supabase
    .from('bowling_deliveries')
    .insert({
      bowler_id:        user.id,
      match_id:         input.matchId ?? null,
      over_index:       input.overIndex ?? null,
      recorded_via:     input.recordedVia ?? 'manual_tap',
      distance_m:       dist,
      duration_ms:      Math.round(dur),
      speed_kmh:        speedKmh,
      speed_is_outlier: isOutlier,
      privacy_state:    input.privacyState ?? 'private',
      note:             input.note ?? null,
      release_ms:       input.releaseMs    ?? null,
      pitch_ms:         input.pitchMs      ?? null,
      arm_angle_deg:    input.armAngleDeg  ?? null,
      action_class:     input.actionClass  ?? null,
      thumbnail_url:    input.thumbnailUrl ?? null,
    })
    .select('*')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Insert failed' };

  revalidatePath('/bowling');
  revalidatePath(`/players/${user.id}`);
  return { ok: true, data: { delivery: data as BowlingDelivery } };
}

export async function deleteBowlingDelivery(id: string): Promise<ActionResult> {
  const { supabase, user } = await getServerAuth();
  if (!user) return { ok: false, error: 'Sign in to delete' };

  const { error } = await supabase
    .from('bowling_deliveries')
    .delete()
    .eq('id', id)
    .eq('bowler_id', user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/bowling');
  return { ok: true, data: undefined };
}

/** Reads the viewer's own deliveries, newest first. Outliers included so
 *  the user can see them — UI separates them from headline stats. */
export async function getMyBowlingDeliveries(
  limit = 50,
): Promise<BowlingDelivery[]> {
  const { supabase, user } = await getServerAuth();
  if (!user) return [];
  const { data } = await supabase
    .from('bowling_deliveries')
    .select('*')
    .eq('bowler_id', user.id)
    .order('recorded_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as BowlingDelivery[];
}

/**
 * Recent speed readings for a single bowler in a single match. Used by the
 * live scorer to surface immediate feedback ("⚡ 78 km/h · peak 92") after
 * a delivery is captured, instead of letting the reading disappear into
 * the DB. Outliers excluded so peak/avg aren't poisoned by mistimed taps.
 */
export async function getRecentBowlerSpeeds(
  matchId: string,
  bowlerId: string,
  limit = 6,
): Promise<{ deliveries: Array<{ id: string; speed_kmh: number; recorded_at: string }>; peak: number | null; avg: number | null }> {
  const { supabase } = await getServerAuth();
  const { data } = await supabase
    .from('bowling_deliveries')
    .select('id, speed_kmh, recorded_at')
    .eq('match_id', matchId)
    .eq('bowler_id', bowlerId)
    .eq('speed_is_outlier', false)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as Array<{ id: string; speed_kmh: number; recorded_at: string }>;
  if (rows.length === 0) return { deliveries: [], peak: null, avg: null };
  const peak = rows.reduce((m, r) => Math.max(m, r.speed_kmh), 0);
  const avg  = rows.reduce((s, r) => s + r.speed_kmh, 0) / rows.length;
  return {
    deliveries: rows,
    peak: Math.round(peak * 10) / 10,
    avg:  Math.round(avg  * 10) / 10,
  };
}

/** Public DNA card data for any player. Honours RLS — only public + match
 *  deliveries leak to viewers other than the bowler. */
export async function getBowlingDna(
  bowlerId: string,
  rollingWindow = 10,
): Promise<BowlingDna> {
  const { supabase } = await getServerAuth();
  const { data } = await supabase
    .from('bowling_deliveries')
    .select('speed_kmh, recorded_at')
    .eq('bowler_id', bowlerId)
    .eq('speed_is_outlier', false)
    .order('recorded_at', { ascending: false })
    .limit(rollingWindow);

  const rows = (data ?? []) as Array<{ speed_kmh: number }>;
  if (rows.length === 0) {
    return { delivery_count: 0, peak_kmh: null, rolling_avg_kmh: null };
  }

  const peak = rows.reduce((m, r) => Math.max(m, r.speed_kmh), 0);
  const avg  = rows.reduce((s, r) => s + r.speed_kmh, 0) / rows.length;

  return {
    delivery_count:  rows.length,
    peak_kmh:        Math.round(peak * 10) / 10,
    rolling_avg_kmh: Math.round(avg  * 10) / 10,
  };
}
