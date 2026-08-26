import { NextResponse } from 'next/server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getJob } from '@/lib/jobs';
import {
  mapJobToAccountingInvoice,
  mapPermitFeeToVendorBill,
  calculateJobFinancialLedger,
  type AccountingVendorBill,
} from '@/lib/accounting/accounting-sync-engine';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/accounting/sync
 * Syncs job revenue, invoices, permit fees, and material expenses to accounting ledger.
 */
export async function POST(request: Request) {
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

  let body: {
    jobId?: string;
    platform?: 'quickbooks_online' | 'xero';
    includePermitFees?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body.jobId || !UUID_REGEX.test(body.jobId)) {
    return NextResponse.json({ error: 'Valid jobId is required.' }, { status: 400 });
  }

  const job = await getJob(supabase, membership.accountId, body.jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  const bills: AccountingVendorBill[] = [];

  // 1. Fetch permit cases/fees for this job if any
  try {
    const { data: permitCases } = await supabase
      .from('permit_cases')
      .select('authority_name, permit_number, total_fee')
      .eq('job_id', job.id);

    if (permitCases && permitCases.length > 0) {
      for (const p of permitCases) {
        if (p.total_fee && p.total_fee > 0) {
          bills.push(
            mapPermitFeeToVendorBill({
              jobRef: job.ref,
              authorityName: p.authority_name || 'Municipal Building Department',
              feeAmount: Number(p.total_fee),
              permitNumber: p.permit_number,
            }),
          );
        }
      }
    }
  } catch {
    // Ignore if table missing or empty
  }

  const invoice = mapJobToAccountingInvoice({
    jobId: job.id,
    jobRef: job.ref,
    clientName: job.client_name,
    clientEmail: job.client_email,
    clientPhone: job.client_phone,
    address: job.address,
    quotedAmount: job.quoted_amount,
    status: job.status,
  });

  const ledger = calculateJobFinancialLedger({
    jobId: job.id,
    jobRef: job.ref,
    customerName: job.client_name,
    invoice,
    bills,
    platform: body.platform || 'quickbooks_online',
  });

  return NextResponse.json({
    success: true,
    ledger,
  });
}
