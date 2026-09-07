import { NextRequest, NextResponse } from 'next/server';
import { runVerification, runOfflineConversionVerification } from '@/lib/google-ads-verifier';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60s for live Google Ads API calls

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = request.headers.get('authorization');
  if (auth && auth.replace(/^Bearer\s+/i, '').trim() === secret) {
    return true;
  }

  const querySecret = request.nextUrl.searchParams.get('secret');
  if (querySecret && querySecret === secret) {
    return true;
  }

  const xCron = request.headers.get('x-cron-secret');
  if (xCron && xCron.trim() === secret) {
    return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const customerId = request.nextUrl.searchParams.get('customerId') || process.env.GOOGLE_ADS_CLIENT_CUSTOMER_ID || '2285671544';

  const writePathReport = await runVerification({ customerId });
  const offlineReport = await runOfflineConversionVerification({ customerId });

  const statusCode = (writePathReport.success && offlineReport.success) ? 200 : 207;

  return NextResponse.json(
    {
      ok: writePathReport.success && offlineReport.success,
      timestamp: new Date().toISOString(),
      customerId: customerId.replace(/-/g, ''),
      environmentAudit: {
        featureManagedAdsCheckoutEnabled: process.env.FEATURE_MANAGED_ADS_CHECKOUT_ENABLED || '(unset)',
        googleAdsConversionActionIdWonJob: process.env.GOOGLE_ADS_CONVERSION_ACTION_ID_WON_JOB || writePathReport.wonJobConversionActionId || '(unset)',
        billingSetup: writePathReport.billingSetups?.[0] || null,
      },
      writePath: writePathReport,
      offlineConversions: offlineReport,
    },
    { status: statusCode }
  );
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const customerId = body.customerId || request.nextUrl.searchParams.get('customerId') || process.env.GOOGLE_ADS_CLIENT_CUSTOMER_ID || '2285671544';

  const writePathReport = await runVerification({ customerId });
  const offlineReport = await runOfflineConversionVerification({ customerId });

  const statusCode = (writePathReport.success && offlineReport.success) ? 200 : 207;

  return NextResponse.json(
    {
      ok: writePathReport.success && offlineReport.success,
      timestamp: new Date().toISOString(),
      customerId: customerId.replace(/-/g, ''),
      environmentAudit: {
        featureManagedAdsCheckoutEnabled: process.env.FEATURE_MANAGED_ADS_CHECKOUT_ENABLED || '(unset)',
        googleAdsConversionActionIdWonJob: process.env.GOOGLE_ADS_CONVERSION_ACTION_ID_WON_JOB || writePathReport.wonJobConversionActionId || '(unset)',
        billingSetup: writePathReport.billingSetups?.[0] || null,
      },
      writePath: writePathReport,
      offlineConversions: offlineReport,
    },
    { status: statusCode }
  );
}
