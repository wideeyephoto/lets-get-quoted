import { NextResponse } from 'next/server';
import {
  runConnectedPaymentProjectionCronBatch,
  stripeConnectedPaymentProjectionWorkerEnabled,
} from '@/lib/billing/billing-worker-cron';
import { cronRoute } from '@/lib/cron-runs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const authenticatedGET = cronRoute('connected-payment-projection', runConnectedPaymentProjectionCronBatch);

export async function GET(request: Request): Promise<NextResponse> {
  // Keep this before authenticatedGET: OFF means no secret/header read,
  // heartbeat, service-role client, queue claim, or Stripe provider retrieval.
  if (!stripeConnectedPaymentProjectionWorkerEnabled()) {
    return new NextResponse(null, { status: 404 });
  }
  return authenticatedGET(request);
}
