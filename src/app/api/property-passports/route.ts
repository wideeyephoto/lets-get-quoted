import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { listPropertyPassports, createPropertyPassport } from '@/lib/property-passport-data';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
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

    const held = await loadHeldCapabilities(
      membership.role as 'owner' | 'crew' | 'office' | null,
      membership.accountId,
      user.id,
    );

    if (membership.role !== 'owner' && !held.has('jobs.read') && !held.has('clients.read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const clientId = request.nextUrl.searchParams.get('clientId') || undefined;
    const passports = await listPropertyPassports(supabase, membership.accountId, clientId);
    return NextResponse.json({ passports });
  } catch (error) {
    console.error('API /api/property-passports GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
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

    const held = await loadHeldCapabilities(
      membership.role as 'owner' | 'crew' | 'office' | null,
      membership.accountId,
      user.id,
    );

    if (membership.role !== 'owner' && !held.has('jobs.write') && !held.has('clients.write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    if (!body || !body.address || !body.homeownerName) {
      return NextResponse.json({ error: 'Address and homeowner name are required.' }, { status: 400 });
    }

    const passport = await createPropertyPassport(supabase, membership.accountId, body);
    return NextResponse.json({ passport }, { status: 201 });
  } catch (error) {
    console.error('API /api/property-passports POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
