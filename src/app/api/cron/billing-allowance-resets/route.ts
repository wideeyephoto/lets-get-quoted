import { NextResponse } from 'next/server';
import {
  paidPlanAllowanceResetWorkerEnabled,
  runPaidPlanAllowanceResetCronBatch,
} from '@/lib/billing/billing-worker-cron';
import { cronRoute } from '@/lib/cron-runs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const authenticatedGET = cronRoute('billing-allowance-resets', runPaidPlanAllowanceResetCronBatch);

export async function GET(request: Request): Promise<NextResponse> {
  // Keep this before authenticatedGET: OFF means no secret read, heartbeat,
  // service-role client, request-body read, queue claim, or database mutation.
  if (!paidPlanAllowanceResetWorkerEnabled()) {
    return new NextResponse(null, { status: 404 });
  }
  return authenticatedGET(request);
}
