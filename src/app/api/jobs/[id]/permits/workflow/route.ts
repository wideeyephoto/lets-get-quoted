import { NextResponse } from 'next/server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getJob } from '@/lib/jobs';
import {
  updatePermitCase,
  syncPermitTasksToChecklist,
  recordPermitFeeExpense,
} from '@/lib/permit-intel';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/jobs/:id/permits/workflow
 *
 * Internal workflow actions for permit cases:
 * - update_status: change lifecycle status and external permit number
 * - sync_tasks: add required permit and inspection submittals to job_tasks
 * - record_fee: record municipal fee into job expenses
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in to update permit workflow.' }, { status: 401 });
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
    const job = await getJob(supabase, membership.accountId, params.id);
    if (!job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }

    const payload = await request.json();
    const action = payload?.action;

    if (action === 'update_status') {
      const updatedCase = await updatePermitCase(
        supabase,
        membership.accountId,
        params.id,
        {
          applicationStatus: payload.applicationStatus,
          externalPermitNumber: payload.externalPermitNumber,
          notes: payload.notes,
        },
        user.email || 'Office',
      );
      return NextResponse.json({ success: true, permitCase: updatedCase });
    }

    if (action === 'sync_tasks') {
      const result = await syncPermitTasksToChecklist(
        supabase,
        membership.accountId,
        params.id,
        payload.authorityName || 'Municipal Building Department',
        {
          documents: payload.documents || [],
          inspections: payload.inspections || [],
        },
        user.email || 'Office',
      );
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'record_fee') {
      const feeAmount = Number(payload.feeAmount);
      if (!Number.isFinite(feeAmount) || feeAmount <= 0) {
        return NextResponse.json({ error: 'Invalid fee amount.' }, { status: 400 });
      }

      const markupAmount = payload.markupAmount ? Number(payload.markupAmount) : 0;

      const result = await recordPermitFeeExpense(
        supabase,
        membership.accountId,
        params.id,
        {
          feeAmount,
          markupAmount,
          authorityName: payload.authorityName || 'Building Department',
          receiptRef: payload.receiptRef,
          addToInvoice: Boolean(payload.addToInvoice),
          invoiceId: payload.invoiceId,
          authorName: user.email || 'Office',
        },
      );
      const cost = (result as any)?.cost || result;
      return NextResponse.json({
        success: true,
        cost,
        invoiceItem: (result as any)?.invoiceItem,
        totalBilled: (result as any)?.totalBilled,
        markupAmount: (result as any)?.markupAmount,
      });
    }

    return NextResponse.json({ error: 'Unsupported workflow action.' }, { status: 400 });
  } catch (error) {
    console.error('Error executing permit workflow action:', error);
    return NextResponse.json({ error: 'Failed to execute permit workflow action.' }, { status: 500 });
  }
}
