import { NextResponse } from 'next/server';
import { requireOfficeContext } from '@/lib/auth';
import { loadCrewLocationMapSnapshot } from '@/lib/crew-location';
import { unstable_rethrow } from 'next/navigation';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { supabase, accountId, role, capabilities } = await requireOfficeContext('crew.read');
    const canViewPay = role === 'owner' || capabilities.has('crew_pay.read');
    const snapshot = await loadCrewLocationMapSnapshot(supabase, accountId, { canViewPay });
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    // A guard denies by calling redirect(), which throws. Without this the
    // denial is swallowed and reported as a 500 carrying NEXT_REDIRECT.
    unstable_rethrow(error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unauthorized' },
      { status: 401 },
    );
  }
}
