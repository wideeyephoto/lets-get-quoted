import { NextResponse } from 'next/server';
import {
  runTopUpProjectionCronBatch,
  stripeTopUpProjectionWorkerEnabled,
} from '@/lib/billing/billing-worker-cron';
import { cronRoute } from '@/lib/cron-runs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const authenticatedGET = cronRoute('top-up-projection', runTopUpProjectionCronBatch);

export async function GET(request: Request): Promise<NextResponse> {
  // Keep this before authenticatedGET: OFF means no secret/header read,
  // heartbeat, service-role client, queue claim, or Stripe Session retrieval.
  if (!stripeTopUpProjectionWorkerEnabled()) {
    return new NextResponse(null, { status: 404 });
  }
  return authenticatedGET(request);
}
