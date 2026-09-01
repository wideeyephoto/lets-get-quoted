import { NextResponse } from 'next/server';
import {
  processPayrollWebhook,
} from '@/lib/payroll-api-integration';
import { normalizePayrollProvider } from '@/lib/payroll-export';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payroll/webhook
 *
 * Inbound webhook listener for payroll provider callbacks (Gusto, QuickBooks, ADP, Paychex).
 * Updates internal pay tracking when a submitted payroll batch is processed or paid.
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const providerParam = url.searchParams.get('provider') || request.headers.get('x-payroll-provider');
    const provider = normalizePayrollProvider(providerParam);

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

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
