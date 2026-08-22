import { NextResponse } from 'next/server';

import { cronRoute } from '@/lib/cron-runs';
import {
  overageSettlementWorkerEnabled,
  runOverageSettlementBatch,
} from '@/lib/billing/overage-settlement-worker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const authenticatedGET = cronRoute('overage-settlement', runOverageSettlementBatch);

export async function GET(request: Request): Promise<NextResponse> {
  // This one creates a charge against a real customer, so its own flag gates it
  // separately from the period-close worker that only freezes a number.
  if (!overageSettlementWorkerEnabled()) return new NextResponse(null, { status: 404 });
  return authenticatedGET(request);
}
