import { NextResponse } from 'next/server';

import { cronRoute } from '@/lib/cron-runs';
import {
  overagePeriodCloseWorkerEnabled,
  runOveragePeriodCloseBatch,
} from '@/lib/billing/overage-settlement-worker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const authenticatedGET = cronRoute('overage-period-close', runOveragePeriodCloseBatch);

export async function GET(request: Request): Promise<NextResponse> {
  // Before authenticatedGET: a dark worker has no externally discoverable route
  // and claims no work -- no secret read, no heartbeat, no service-role client.
  if (!overagePeriodCloseWorkerEnabled()) return new NextResponse(null, { status: 404 });
  return authenticatedGET(request);
}
