import { NextResponse } from 'next/server';

import { cronRoute } from '@/lib/cron-runs';
import {
  runVoiceAllowanceBatch,
  voiceAllowanceWorkerEnabled,
} from '@/lib/billing/voice-allowance-worker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const authenticatedGET = cronRoute('voice-allowance', runVoiceAllowanceBatch);

export async function GET(request: Request): Promise<NextResponse> {
  // Flag first, exactly as the allowance-reset route does it. OFF means no
  // secret read, no heartbeat row, no service-role client, and no database
  // mutation — so deploying this ahead of its migration cannot disturb anything.
  if (!voiceAllowanceWorkerEnabled()) {
    return new NextResponse(null, { status: 404 });
  }
  return authenticatedGET(request);
}
