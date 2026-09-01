import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { addEquipmentToPassport } from '@/lib/property-passport-data';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> },
) {
  try {
    const params = await paramsPromise;
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
    if (!body || !body.name || !body.brand) {
      return NextResponse.json({ error: 'Equipment name and brand are required.' }, { status: 400 });
    }

    const equipment = await addEquipmentToPassport(supabase, membership.accountId, params.id, body);
    return NextResponse.json({ equipment }, { status: 201 });
  } catch (error) {
    console.error('API /api/property-passports/[id]/equipment POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
