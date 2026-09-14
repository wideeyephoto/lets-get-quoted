import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ingestDataManagerConversion, usesDataManager } from '@/lib/google-data-manager';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await ingestDataManagerConversion({
    conversionActionName: process.env.GOOGLE_ADS_CONVERSION_ACTION_ID_WON_JOB || '',
    gclid: 'validation_only_synthetic_click', orderId: 'data-manager-validation-only',
    conversionValueDollars: 1, currencyCode: 'USD',
  }, true);
  return NextResponse.json({ ok: result.success, timestamp: new Date().toISOString(), transport: 'data-manager', productionTransportEnabled: usesDataManager(), validationOnly: true, conversionRecorded: false, stage: result.stage, warningCount: result.warningCount, message: result.message }, { status: result.success ? 200 : 502, headers: { 'Cache-Control': 'no-store' } });
}
