import { NextResponse } from 'next/server';

import { cronRoute } from '@/lib/cron-runs';
import {
  runSmsInboundActionCronBatch,
  smsInboundActionWorkerEnabled,
} from '@/lib/sms-inbound-action-cron';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const authenticatedGET = cronRoute('sms-inbound-actions', runSmsInboundActionCronBatch);

export async function GET(request: Request): Promise<NextResponse> {
  if (!smsInboundActionWorkerEnabled()) return new NextResponse(null, { status: 404 });
  return authenticatedGET(request);
}
