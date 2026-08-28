import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { processInboundPermitWebhook } from '@/lib/permit-intel';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/permits/:provider
 *
 * Inbound webhook receiver for municipal permit portals (BS&A, Accela, OpenGov)
 * and status synchronization partners.
 */
export async function POST(
  request: Request,
  { params }: { params: { provider: string } },
) {
  const secretHeader = request.headers.get('x-permit-webhook-secret');
  const admin = createAdminClient();

  try {
    const payload = await request.json();
    const result = await processInboundPermitWebhook(
      admin,
      params.provider,
      payload,
      secretHeader,
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error processing permit webhook:', error);
    const message = error instanceof Error ? error.message : 'Failed to process webhook.';
    let status = 400;
    if (message.includes('not configured')) {
      status = 503;
    } else if (message.includes('Unauthorized')) {
      status = 401;
    }
    return NextResponse.json({ error: message }, { status });
  }
}
