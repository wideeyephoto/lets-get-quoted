import { NextResponse } from 'next/server';
import { ADDON_REFUND_FLAG } from '@/lib/billing/addon-refunds';
import { runAddonRefundBatch } from '@/lib/billing/addon-refund-worker';
import { cronRoute } from '@/lib/cron-runs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const authenticatedGET = cronRoute('addon-refunds', runAddonRefundBatch);
export async function GET(request: Request) {
  if (process.env[ADDON_REFUND_FLAG] !== '1') return new NextResponse(null, { status: 404 });
  return authenticatedGET(request);
}
