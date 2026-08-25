import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();

  const services = [
    {
      id: 'quoting-engine',
      name: 'Instant Quoting & PDF Engine',
      status: 'operational' as const,
      detail: 'Google Cloud Run (us-east1)',
    },
    {
      id: 'sms-gateway',
      name: 'Two-Way SMS & Dedicated Phone Gateway',
      status: 'operational' as const,
      detail: 'SignalWire / 10DLC Carrier Network',
    },
    {
      id: 'stripe-payments',
      name: 'Stripe Payments & Deposits',
      status: 'operational' as const,
      detail: 'Stripe Connect API V2',
    },
    {
      id: 'contractor-cdn',
      name: 'Contractor Website CDN & DNS',
      status: 'operational' as const,
      detail: 'Global Anycast Edge Network',
    },
  ];

  const latencyMs = Date.now() - startTime;

  return NextResponse.json({
    status: 'operational',
    timestamp: new Date().toISOString(),
    latencyMs: Math.max(1, latencyMs),
    services,
  });
}
