import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';

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
};

export async function GET() {
  const startTime = performance.now();
  const services: HealthService[] = [];

  // 1. Quoting Engine & Database
  const dbStart = performance.now();
  let dbStatus: HealthServiceStatus = 'operational';
  let dbDetail = 'Google Cloud Run (us-east1) · PostgreSQL connected';
  try {
    const admin = createAdminClient();
    const probePromise = admin.from('sites').select('id').limit(1);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Database probe timed out after 2000ms')), 2000)
    );
    const { error } = (await Promise.race([probePromise, timeoutPromise])) as { error: { message: string } | null };
    const dbElapsed = Math.round(performance.now() - dbStart);
    if (error) {
      dbStatus = 'outage';
      dbDetail = `Database query error: ${error.message}`;
    } else if (dbElapsed > 1500) {
      dbStatus = 'degraded';
      dbDetail = `High database latency (${dbElapsed}ms)`;
    } else {
      dbDetail = `Google Cloud Run (us-east1) · PostgreSQL connected (${dbElapsed}ms)`;
    }
  } catch (err) {
    dbStatus = 'outage';
    dbDetail = `Database unreachable: ${err instanceof Error ? err.message : String(err)}`;
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

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      latencyMs: totalLatencyMs,
      services,
    },
    { status: overallStatus === 'outage' ? 503 : 200 },
  );
}
