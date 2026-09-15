import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { buildGoogleAdsHeaders, fetchGoogleAdsAccessToken, getGoogleAdsConfig, GOOGLE_ADS_API_BASE_URL } from '@/lib/google-ads-api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Credential/access probe only: never calls campaign or conversion mutations. */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected)
    || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const config = getGoogleAdsConfig();
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    return NextResponse.json({ ok: false, stage: 'credentials', error: 'Google Ads OAuth credentials are missing.' }, { status: 503 });
  }

  let stage = 'oauth';
  try {
    const token = await fetchGoogleAdsAccessToken(config);
    // Account discovery does not use a manager login header.
    const headers = buildGoogleAdsHeaders({}, token);
    stage = 'account-discovery';
    const response = await fetch(`${GOOGLE_ADS_API_BASE_URL}/customers:listAccessibleCustomers`, {
      method: 'GET', headers, cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return NextResponse.json({ ok: false, stage, upstreamStatus: response.status }, { status: 502 });
    }
    const payload = await response.json();
    const accounts = payload.resourceNames ?? [];
    if (!Array.isArray(accounts) || accounts.some((account: unknown) => typeof account !== 'string')) {
      throw new Error('Malformed account discovery response');
    }
    const managerId = config.mccCustomerId?.replace(/-/g, '').trim();
    return NextResponse.json({
      ok: true, mode: 'read-only', timestamp: new Date().toISOString(), upstreamStatus: response.status,
      developerTokenHeaderSent: Object.prototype.hasOwnProperty.call(headers, 'developer-token'),
      accessibleAccountCount: accounts.length,
      managerAccountAccessible: managerId ? accounts.includes(`customers/${managerId}`) : null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Provider errors can contain credentials or account details. Return only the failed stage.
    return NextResponse.json({ ok: false, stage, error: 'Google Ads read-only verification failed.' }, { status: 502 });
  }
}
