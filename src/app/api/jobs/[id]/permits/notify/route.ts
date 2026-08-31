import { NextResponse } from 'next/server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { sendPermitMilestoneNotification } from '@/lib/permit-intel';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/jobs/:id/permits/notify
 * Dispatches a milestone notification to the homeowner via SMS and logs to job timeline feed.
 */
export async function POST(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> },
) {
  const params = await paramsPromise;
  const supabase = await createSupabaseServerClient();
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

  if (membership.role !== 'owner' && !held.has('jobs.write')) {
    return NextResponse.json({ error: 'Permission jobs.write required.' }, { status: 403 });
  }

  if (!UUID_REGEX.test(params.id)) {
    return NextResponse.json({ error: 'Invalid job id format.' }, { status: 400 });
  }

  try {
    const payload = await request.json();
    if (!payload?.eventType) {
      return NextResponse.json({ error: 'eventType is required.' }, { status: 400 });
    }

    const result = await sendPermitMilestoneNotification(
      supabase,
      membership.accountId,
      params.id,
      payload,
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error dispatching permit notification:', error);
    const message = error instanceof Error ? error.message : 'Failed to send notification.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
