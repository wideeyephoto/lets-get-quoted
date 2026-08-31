import { NextResponse } from 'next/server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getJob } from '@/lib/jobs';
import {
  scheduleInspection,
  recordInspectionResult,
} from '@/lib/permit-intel';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/jobs/:id/permits/inspections/:inspectionId
 * Updates inspection scheduling or records pass/fail result.
 */
export async function PATCH(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ id: string; inspectionId: string }> },
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

  if (!UUID_REGEX.test(params.id) || !UUID_REGEX.test(params.inspectionId)) {
    return NextResponse.json({ error: 'Invalid UUID format.' }, { status: 400 });
  }

  try {
    const job = await getJob(supabase, membership.accountId, params.id);
    if (!job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }

    const payload = await request.json();
    const action = payload?.action;

    if (action === 'schedule') {
      if (!payload.scheduledDate) {
        return NextResponse.json({ error: 'scheduledDate is required.' }, { status: 400 });
      }

      const inspection = await scheduleInspection(
        supabase,
        membership.accountId,
        params.id,
        params.inspectionId,
        {
          scheduledDate: payload.scheduledDate,
          inspectorName: payload.inspectorName,
          inspectorPhone: payload.inspectorPhone,
          notes: payload.notes,
        },
        user.email || 'Office',
      );

      return NextResponse.json({ success: true, inspection });
    }

    if (action === 'record_result') {
      if (payload.status !== 'passed' && payload.status !== 'failed') {
        return NextResponse.json({ error: 'status must be "passed" or "failed".' }, { status: 400 });
      }

      const outcome = await recordInspectionResult(
        supabase,
        membership.accountId,
        params.id,
        params.inspectionId,
        {
          status: payload.status,
          inspectorName: payload.inspectorName,
          notes: payload.notes,
          failureReasons: payload.failureReasons,
          reinspectionFee: payload.reinspectionFee ? Number(payload.reinspectionFee) : undefined,
        },
        user.email || 'Office',
      );

      return NextResponse.json({ success: true, ...outcome });
    }

    return NextResponse.json({ error: 'Unsupported inspection action.' }, { status: 400 });
  } catch (error) {
    console.error('Error updating inspection milestone:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update inspection.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
