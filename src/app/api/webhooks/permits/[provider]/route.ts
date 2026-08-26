import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
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
  const supabase = createSupabaseServerClient();

  try {
    const payload = await request.json();
    const result = await processInboundPermitWebhook(
      supabase,
      params.provider,
      payload,
      secretHeader,
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error processing permit webhook:', error);
    const message = error instanceof Error ? error.message : 'Failed to process webhook.';
    const status = message.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
