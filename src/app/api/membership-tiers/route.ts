import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { listMembershipTiers, createMembershipTier } from '@/lib/membership-tiers';

export const dynamic = 'force-dynamic';

export async function GET() {
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

    if (membership.role !== 'owner' && !held.has('jobs.read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tiers = await listMembershipTiers(supabase, membership.accountId);
    return NextResponse.json({ tiers });
  } catch (error) {
    console.error('API /api/membership-tiers GET error:', error);
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

    if (membership.role !== 'owner' && !held.has('jobs.write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    if (!body || !body.name || typeof body.monthlyPrice !== 'number') {
      return NextResponse.json({ error: 'Name and monthly price are required.' }, { status: 400 });
    }

    const tier = await createMembershipTier(supabase, membership.accountId, body);
    return NextResponse.json({ tier }, { status: 201 });
  } catch (error) {
    console.error('API /api/membership-tiers POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
