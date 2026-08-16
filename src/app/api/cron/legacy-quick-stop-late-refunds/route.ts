import { NextResponse } from 'next/server';

import {
  legacyQuickStopLateRefundWorkerEnabled,
  runLegacyQuickStopLateRefundCronBatch,
} from '@/lib/billing/billing-worker-cron';
import { cronRoute } from '@/lib/cron-runs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const authenticatedGET = cronRoute('legacy-quick-stop-late-refunds', runLegacyQuickStopLateRefundCronBatch);

export async function GET(request: Request): Promise<NextResponse> {
  // Keep this before authenticatedGET: OFF means no header/secret read,
  // heartbeat, service-role client, database claim, or Stripe client/egress.
  if (!legacyQuickStopLateRefundWorkerEnabled()) {
    return new NextResponse(null, { status: 404 });
  }
  return authenticatedGET(request);
}
