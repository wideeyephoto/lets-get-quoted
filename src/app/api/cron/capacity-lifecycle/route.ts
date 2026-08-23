import { NextResponse } from 'next/server';
import {
  purchasedCapacityLifecycleWorkerEnabled,
  runPurchasedCapacityLifecycleCron,
} from '@/lib/billing/billing-worker-cron';
import { cronRoute } from '@/lib/cron-runs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const authenticatedGET = cronRoute('capacity-lifecycle', runPurchasedCapacityLifecycleCron);

export async function GET(request: Request): Promise<NextResponse> {
  // Keep this before authenticatedGET: OFF means no secret/header read,
  // heartbeat, service-role client, or Stripe subscription retrieval.
  if (!purchasedCapacityLifecycleWorkerEnabled()) {
    return new NextResponse(null, { status: 404 });
  }
  return authenticatedGET(request);
}
