import { NextResponse } from 'next/server';
import { cronRoute } from '@/lib/cron-runs';
import { runSmsCanaryProbe } from '@/lib/sms-canary';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const authenticatedGET = cronRoute('sms-canary', async () => {
  const result = await runSmsCanaryProbe();
  return {
    success: result.ok,
    status: result.status,
    probeId: result.probeId,
    latencyMs: result.latencyMs,
    error: result.error,
    message: result.message,
  };
});

export async function GET(request: Request): Promise<NextResponse> {
  return authenticatedGET(request);
}
