import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership } from '@/lib/auth';
import { getPropertyIntelligence } from '@/lib/property-intel';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await getCurrentMembership(user.id);
    if (!membership.accountId) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const address = searchParams.get('address') ?? '';
    const latParam = searchParams.get('lat');
    const lngParam = searchParams.get('lng');

    const lat = latParam ? parseFloat(latParam) : undefined;
    const lng = lngParam ? parseFloat(lngParam) : undefined;

    if (!address && (lat == null || lng == null)) {
      return NextResponse.json({ error: 'Address or lat/lng coordinates required' }, { status: 400 });
    }

    const intel = await getPropertyIntelligence({
      address,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
    });

    if (!intel) {
      return NextResponse.json({ data: null, message: 'No property intelligence available for this location' });
    }

    return NextResponse.json({ data: intel }, {
      headers: {
        'Cache-Control': 'private, max-age=3600', // 1 hour client cache
      },
    });
  } catch (error) {
    console.error('API /api/property-intel error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
