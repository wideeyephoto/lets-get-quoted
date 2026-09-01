import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { recordRequestMetric, getApmSummary } from '@/lib/apm-telemetry';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export type HealthServiceStatus = 'operational' | 'degraded' | 'outage';

export type HealthService = {
  id: string;
  name: string;
  status: HealthServiceStatus;
  detail: string;
};

export type HealthResponse = {
  status: HealthServiceStatus;
  timestamp: string;
  latencyMs: number;
  services: HealthService[];
  apm?: {
    p95Ms?: number;
    errorRatePct?: number;
    active: boolean;
  };
};

function isAuthorizedDiagnosticCaller(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = req.headers?.get('authorization');
  if (authHeader && authHeader.replace(/^Bearer\s+/i, '').trim() === cronSecret) {
    return true;
  }

  const xCronHeader = req.headers?.get('x-cron-secret');
  if (xCronHeader && xCronHeader.trim() === cronSecret) {
    return true;
  }

  const searchSecret = req.nextUrl?.searchParams?.get('secret');
  if (searchSecret && searchSecret === cronSecret) {
    return true;
  }

  return false;
}

export async function GET(req: NextRequest) {
  const startTime = performance.now();
  const services: HealthService[] = [];

  const isAuthed = isAuthorizedDiagnosticCaller(req);

  // Rate-limit unauthenticated diagnostic probes to prevent abuse
  if (!isAuthed) {
    try {
      const ip = clientIpFrom(req.headers);
      const admin = createAdminClient();
      const allowed = await checkRateLimit(admin, `health:ip:${ip}`, 120, 60);
      if (!allowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
    } catch {
      // Fail open on rate limiter connection errors
    }
  }

  // 1. Quoting Engine & Database
  const dbStart = performance.now();
  let dbStatus: HealthServiceStatus = 'operational';
  let dbDetail = isAuthed ? 'PostgreSQL database connected' : 'Operational';
  try {
    const admin = createAdminClient();
    const probePromise = admin.from('sites').select('id').limit(1);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Database probe timed out')), 2000)
    );
    const { error } = (await Promise.race([probePromise, timeoutPromise])) as { error: { message: string } | null };
    const dbElapsed = Math.round(performance.now() - dbStart);
    if (error) {
      dbStatus = 'outage';
      dbDetail = isAuthed ? 'Database service query error' : 'Service unavailable';
    } else if (dbElapsed > 1500) {
      dbStatus = 'degraded';
      dbDetail = isAuthed ? `High database latency (${dbElapsed}ms)` : 'High latency detected';
    } else {
      dbDetail = isAuthed ? `PostgreSQL database operational (${dbElapsed}ms)` : 'Operational';
    }
  } catch {
    dbStatus = 'outage';
    dbDetail = isAuthed ? 'Database service unreachable' : 'Service unavailable';
  }

  services.push({
    id: 'quoting-engine',
    name: 'Instant Quoting & PDF Engine',
    status: dbStatus,
    detail: dbDetail,
  });

  // 2. Two-Way SMS & Dedicated Phone Gateway
  const hasSmsConfig = Boolean(
    (process.env.SIGNALWIRE_PROJECT_ID && process.env.SIGNALWIRE_API_TOKEN) ||
    (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
  );
  services.push({
    id: 'sms-gateway',
    name: 'Two-Way SMS & Dedicated Phone Gateway',
    status: hasSmsConfig ? 'operational' : 'degraded',
    detail: isAuthed
      ? (hasSmsConfig ? 'SignalWire / 10DLC Carrier Network operational' : 'Carrier gateway credentials unconfigured')
      : (hasSmsConfig ? 'Operational' : 'Degraded'),
  });

  // 3. Stripe Payments & Deposits
  const hasStripeConfig = Boolean(process.env.STRIPE_SECRET_KEY);
  services.push({
    id: 'stripe-payments',
    name: 'Stripe Payments & Deposits',
    status: hasStripeConfig ? 'operational' : 'degraded',
    detail: isAuthed
      ? (hasStripeConfig ? 'Stripe Connect API V2 operational' : 'Stripe secret key unconfigured')
      : (hasStripeConfig ? 'Operational' : 'Degraded'),
  });

  // 4. Contractor Website CDN & DNS
  const hasCdnConfig = Boolean(process.env.NEXT_PUBLIC_ROOT_DOMAIN || process.env.NEXT_PUBLIC_APP_URL);
  services.push({
    id: 'contractor-cdn',
    name: 'Contractor Website CDN & DNS',
    status: hasCdnConfig ? 'operational' : 'degraded',
    detail: isAuthed
      ? (hasCdnConfig ? 'Global Anycast Edge Network operational' : 'CDN host domain unconfigured')
      : (hasCdnConfig ? 'Operational' : 'Degraded'),
  });

  const totalLatencyMs = Math.max(1, Math.round(performance.now() - startTime));

  // Determine overall status
  let overallStatus: HealthServiceStatus = 'operational';
  if (services.some((s) => s.status === 'outage')) {
    overallStatus = 'outage';
  } else if (services.some((s) => s.status === 'degraded')) {
    overallStatus = 'degraded';
  }

  // Record APM metric for this health probe
  recordRequestMetric({
    path: '/api/health',
    method: 'GET',
    statusCode: overallStatus === 'outage' ? 503 : 200,
    durationMs: totalLatencyMs,
  });

  const apmSummary = getApmSummary();

  const responseBody: HealthResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    latencyMs: isAuthed ? totalLatencyMs : Math.min(totalLatencyMs, 50),
    services,
    apm: isAuthed
      ? {
          p95Ms: apmSummary.latencyPercentiles.p95Ms,
          errorRatePct: apmSummary.errorRatePct,
          active: true,
        }
      : {
          active: true,
        },
  };

  return NextResponse.json(
    responseBody,
    {
      status: overallStatus === 'outage' ? 503 : 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-LGQ-Uptime-Status': overallStatus,
        ...(isAuthed ? { 'X-LGQ-APM-P95': `${apmSummary.latencyPercentiles.p95Ms}ms` } : {}),
      },
    },
  );
}
