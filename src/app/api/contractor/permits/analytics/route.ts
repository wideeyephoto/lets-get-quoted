import { NextResponse } from 'next/server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getPermitAnalytics } from '@/lib/permit-intel';

export const dynamic = 'force-dynamic';

/**
 * GET /api/contractor/permits/analytics
 * Returns workspace-level permit analytics, turnaround metrics, and regional benchmarks.
 */
export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const membership = await getCurrentMembership(user.id);
  if (!membership.accountId) {
    return NextResponse.json({ error: 'No active workspace.' }, { status: 403 });
  }

  if (membership.role === 'crew') {
    return NextResponse.json({ error: 'Forbidden for crew role.' }, { status: 403 });
  }

  const held = await loadHeldCapabilities(
    membership.role as 'owner' | 'crew' | 'office' | null,
    membership.accountId,
    user.id,
  );

  if (membership.role !== 'owner' && !held.has('jobs.read')) {
    return NextResponse.json({ error: 'Permission jobs.read required.' }, { status: 403 });
  }

  try {
    const analytics = await getPermitAnalytics(supabase, membership.accountId);
    return NextResponse.json({ analytics });
  } catch (error) {
    console.error('Error calculating permit analytics:', error);
    const message = error instanceof Error ? error.message : 'Failed to calculate analytics.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
