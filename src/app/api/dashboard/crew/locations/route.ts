import { NextResponse } from 'next/server';
import { requireOfficeContext } from '@/lib/auth';
import { loadCrewLocationMapSnapshot } from '@/lib/crew-location';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { supabase, accountId, role, capabilities } = await requireOfficeContext('crew.read');
    const canViewPay = role === 'owner' || capabilities.has('crew_pay.read');
    const snapshot = await loadCrewLocationMapSnapshot(supabase, accountId, { canViewPay });
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unauthorized' },
      { status: 401 },
    );
  }
}
