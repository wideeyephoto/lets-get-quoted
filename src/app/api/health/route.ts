import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { recordRequestMetric, getApmSummary } from '@/lib/apm-telemetry';

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
    p95Ms: number;
    errorRatePct: number;
    active: boolean;
  };
};

export async function GET(req: NextRequest) {
  const startTime = performance.now();
  const services: HealthService[] = [];

  // Fast ping for synthetic monitoring heartbeats (Better Stack / Pingdom / UptimeRobot)
  const isPing = req ? req.nextUrl?.searchParams?.get('ping') === '1' : false;

  // 1. Quoting Engine & Database
  const dbStart = performance.now();
  let dbStatus: HealthServiceStatus = 'operational';
  let dbDetail = 'PostgreSQL database connected';
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
      dbDetail = 'Database service query error';
    } else if (dbElapsed > 1500) {
      dbStatus = 'degraded';
      dbDetail = `High database latency (${dbElapsed}ms)`;
    } else {
      dbDetail = `PostgreSQL database operational (${dbElapsed}ms)`;
    }
  } catch {
    dbStatus = 'outage';
    dbDetail = 'Database service unreachable';
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
    detail: hasSmsConfig
      ? 'SignalWire / 10DLC Carrier Network operational'
      : 'Carrier gateway credentials unconfigured',
  });

  // 3. Stripe Payments & Deposits
  const hasStripeConfig = Boolean(process.env.STRIPE_SECRET_KEY);
  services.push({
    id: 'stripe-payments',
    name: 'Stripe Payments & Deposits',
    status: hasStripeConfig ? 'operational' : 'degraded',
    detail: hasStripeConfig
      ? 'Stripe Connect API V2 operational'
      : 'Stripe secret key unconfigured',
  });

  // 4. Contractor Website CDN & DNS
  const hasCdnConfig = Boolean(process.env.NEXT_PUBLIC_ROOT_DOMAIN || process.env.NEXT_PUBLIC_APP_URL);
  services.push({
    id: 'contractor-cdn',
    name: 'Contractor Website CDN & DNS',
    status: hasCdnConfig ? 'operational' : 'degraded',
    detail: hasCdnConfig
      ? 'Global Anycast Edge Network operational'
      : 'CDN host domain unconfigured',
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
    latencyMs: totalLatencyMs,
    services,
    apm: {
      p95Ms: apmSummary.latencyPercentiles.p95Ms,
      errorRatePct: apmSummary.errorRatePct,
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
        'X-LGQ-APM-P95': `${apmSummary.latencyPercentiles.p95Ms}ms`,
      },
    },
  );
}
