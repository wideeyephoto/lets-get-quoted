import { NextResponse } from 'next/server';

import { cronRoute } from '@/lib/cron-runs';
import {
  refundReconciliationWorkerEnabled,
  runRefundReconciliationSweep,
} from '@/lib/billing/refund-reconciliation-worker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const authenticatedGET = cronRoute('refund-reconciliation', runRefundReconciliationSweep);

export async function GET(request: Request): Promise<NextResponse> {
  // Flag first, exactly as every other billing cron route does it. OFF means no
  // secret read, no heartbeat row, no service-role client, no Stripe egress —
  // so deploying this ahead of its migration cannot touch anything.
  if (!refundReconciliationWorkerEnabled()) {
    return new NextResponse(null, { status: 404 });
  }
  return authenticatedGET(request);
}
