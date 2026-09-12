import { NextResponse } from 'next/server';
import {
  processPayrollWebhook,
  verifyPayrollWebhookSignature,
} from '@/lib/payroll-api-integration';
import { normalizePayrollProvider } from '@/lib/payroll-export';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/payroll/webhook
 *
 * Inbound webhook listener for payroll provider callbacks (Gusto, QuickBooks,
 * ADP, Paychex).
 *
 * This endpoint is unauthenticated by nature — a provider cannot present a
 * session — so the signature IS the authentication, and it is checked against
 * the exact bytes received before anything reads them. It used to accept the
 * `headers` argument and never look at it, returning `valid: true` for any
 * well-formed JSON from anyone. Nothing was persisted, which is the only reason
 * that was survivable; the docstring promising to update pay tracking was the
 * trap, because the next person to make this endpoint write would have
 * inherited an open door.
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const providerParam = url.searchParams.get('provider') || request.headers.get('x-payroll-provider');
    const provider = normalizePayrollProvider(providerParam);

    // Raw first. A signature covers the bytes the provider sent, and
    // re-serializing a parsed object does not reproduce them.
    let rawBody: string;
    try {
      rawBody = await request.text();
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const secret = process.env.PAYROLL_WEBHOOK_SECRET;
    const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

    // Unconfigured in production is a deployment fault, not an invitation to
    // accept unsigned callbacks. Same posture as the Meta lead webhook.
    if (isProduction && !secret) {
      console.error('Payroll webhook secret is not configured in production.');
      return NextResponse.json({ error: 'Webhook unconfigured in production' }, { status: 500 });
    }

    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    if (secret) {
      const signatureValid = verifyPayrollWebhookSignature({ provider, headers, rawBody });
      if (!signatureValid) {
        console.error(`Payroll webhook signature verification failed for provider ${provider}.`);
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const processed = processPayrollWebhook(provider, headers, body);
    if (!processed.valid || !processed.event) {
      return NextResponse.json(
        { error: processed.error || 'Failed to process provider webhook payload.' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      provider: processed.event.provider,
      eventType: processed.event.eventType,
      batchId: processed.event.batchId,
      settledAt: processed.event.settledAt,
      receivedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal webhook processing error.' },
      { status: 500 },
    );
  }
}
