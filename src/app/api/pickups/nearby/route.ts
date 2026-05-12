import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getNearbyPickups } from '@/lib/pickupsServer';

/**
 * GET /api/pickups/nearby?lat=<>&lng=<>&radius_km=<>&sport=<optional>
 *
 * Returns up to 50 open pickups within radius. Used by the dashboard rail
 * — runs only after the browser has resolved geolocation.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ items: [] }, { status: 401 });

  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get('lat') ?? '');
  const lng = parseFloat(url.searchParams.get('lng') ?? '');
  const radius = parseFloat(url.searchParams.get('radius_km') ?? '10');
  const sport = url.searchParams.get('sport') as
    | 'cricket' | 'football' | 'badminton' | 'table_tennis' | 'foosball' | null;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ items: [], error: 'Invalid coordinates' }, { status: 400 });
  }

  const items = await getNearbyPickups({
    viewerId: user.id,
    viewerLat: lat,
    viewerLng: lng,
    radiusKm: Number.isFinite(radius) ? radius : 10,
    sport: sport ?? undefined,
  });

  return NextResponse.json({ items });
}
