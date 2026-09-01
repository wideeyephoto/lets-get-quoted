import { NextRequest, NextResponse } from 'next/server';
import { resolveJurisdiction } from '@/lib/location-context/jurisdiction-resolver';
import { getApplicableCodes } from '@/lib/permit-intel/code-catalog';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function isAuthorizedPermitDiagnosticCaller(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const permitSecret = process.env.PERMIT_WEBHOOK_SECRET;

  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if ((cronSecret && token === cronSecret) || (permitSecret && token === permitSecret)) {
      return true;
    }
  }

  const searchSecret = request.nextUrl?.searchParams?.get('secret');
  if (searchSecret && ((cronSecret && searchSecret === cronSecret) || (permitSecret && searchSecret === permitSecret))) {
    return true;
  }

  return false;
}

/**
 * GET /api/permits/health
 * System health check and diagnostics for the Permit & Local Codes Intelligence Engine.
 */
export async function GET(request: NextRequest) {
  const ip = clientIpFrom(request.headers);
  const admin = createAdminClient();
  if (!(await checkRateLimit(admin, `permithealth:ip:${ip}`, 60, 60))) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  const timestamp = new Date().toISOString();

  // Test jurisdiction resolver
  const testSample = resolveJurisdiction({
    raw: '211 S Williams St, Royal Oak, MI 48067',
    city: 'Royal Oak',
    state: 'MI',
    postalCode: '48067',
    formattedAddress: '211 S Williams St, Royal Oak, MI 48067',
    isValid: true,
  }, 'building');

  const jurisdictionResolverStatus = testSample.authorityId === 'mi-royal-oak' ? 'healthy' : 'degraded';

  // Test code catalog adoptions across disciplines
  const buildingCodes = getApplicableCodes('mi-royal-oak', 'building');
  const electricalCodes = getApplicableCodes('mi-royal-oak', 'electrical');
  const mechanicalCodes = getApplicableCodes('mi-royal-oak', 'mechanical');
  const plumbingCodes = getApplicableCodes('mi-royal-oak', 'plumbing');

  const codeCatalogStatus =
    buildingCodes.length > 0 &&
    electricalCodes.length > 0 &&
    mechanicalCodes.length > 0 &&
    plumbingCodes.length > 0
      ? 'healthy'
      : 'degraded';

  const isHealthy = jurisdictionResolverStatus === 'healthy' && codeCatalogStatus === 'healthy';
  const isAuthed = isAuthorizedPermitDiagnosticCaller(request);

  if (!isAuthed) {
    return NextResponse.json({
      status: isHealthy ? 'healthy' : 'degraded',
      version: '1.0.0',
      timestamp,
    });
  }

  return NextResponse.json({
    status: isHealthy ? 'healthy' : 'degraded',
    version: '1.0.0',
    timestamp,
    components: {
      locationContext: {
        status: jurisdictionResolverStatus,
        sampleAuthority: testSample.authorityName,
        jurisdictionBaseline: 'Michigan LARA BCC & Local Municipal Authorities',
      },
      codeCatalog: {
        status: codeCatalogStatus,
        adoptions: {
          building: buildingCodes[0]?.codeFamily || '2015 MRC',
          electrical: electricalCodes[0]?.codeFamily || '2023 NEC',
          mechanical: mechanicalCodes[0]?.codeFamily || '2021 MMC',
          plumbing: plumbingCodes[0]?.codeFamily || '2021 MPC',
        },
      },
      submissionPipeline: {
        status: 'ready',
        supportedTiers: ['tier_0', 'tier_1', 'tier_2', 'tier_3', 'tier_4'],
        consentGateEnforced: true,
      },
      providerAdapters: {
        bsaAccessMyGov: 'mock_pilot',
        accelaCitizenAccess: 'in_development',
        openGovPlc: 'in_development',
        openDataGis: 'in_development',
      },
      webhookRouters: {
        status: process.env.PERMIT_WEBHOOK_SECRET ? 'configured' : 'unconfigured',
        providers: ['bsa', 'accela', 'opengov'],
      },
      credentialsVault: {
        status: 'active',
        storage: 'application_database',
      },
    },
  });
}
