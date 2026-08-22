import { NextResponse } from 'next/server';

import { cronRoute } from '@/lib/cron-runs';
import {
  runSmsDeliveryCronBatch,
  smsDeliveryWorkerEnabled,
} from '@/lib/sms-delivery-cron';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const authenticatedGET = cronRoute('sms-delivery', runSmsDeliveryCronBatch);

export async function GET(request: Request): Promise<NextResponse> {
  // A dark worker has no externally discoverable route and cannot claim work.
  if (!smsDeliveryWorkerEnabled()) return new NextResponse(null, { status: 404 });
  return authenticatedGET(request);
}
