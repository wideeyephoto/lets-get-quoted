import { NextRequest, NextResponse } from 'next/server';
import {
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
  parseMetaWebhookPayload,
  fetchMetaLeadDetails,
  normalizeMetaLead,
} from '@/lib/marketplace-router/meta-lead-ads';
import { routeMarketplaceLead } from '@/lib/marketplace-router/routing-engine';

export const runtime = 'nodejs';

/**
 * GET handler for Meta Webhook Verification Handshake.
 * Meta calls this when subscribing a webhook URL in the Meta App Dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const result = verifyMetaWebhookChallenge({
    mode,
    verifyToken: token,
    challenge,
  });

  if (result.valid && result.challenge) {
    return new Response(result.challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return NextResponse.json({ error: 'Verification handshake failed' }, { status: 403 });
}

/**
 * POST handler for Meta Leadgen webhook events.
 */
export async function POST(request: NextRequest) {
  let rawBodyText = '';
  try {
    rawBodyText = await request.text();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // 1. Verify HMAC Signature if configured
  const signatureHeader = request.headers.get('x-hub-signature-256');
  const isSignatureValid = verifyMetaWebhookSignature({
    rawBody: rawBodyText,
    signatureHeader,
  });

  // If secret is configured in environment and signature verification fails, reject
  if ((process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET) && !isSignatureValid) {
    console.error('Meta webhook signature verification failed.');
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = JSON.parse(rawBodyText);
  } catch {
    return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }

  // 2. Parse Leadgen Events
  const events = parseMetaWebhookPayload(body);
  if (events.length === 0) {
    // Return 200 to acknowledge non-leadgen webhook events (e.g. test pings, page status updates)
    return NextResponse.json({ ok: true, count: 0, message: 'No leadgen events in payload' });
  }

  const results = [];
  const searchParams = new URL(request.url).searchParams;
  const explicitAccountId = searchParams.get('accountId') || request.headers.get('x-account-id');

  // 3. Process and Route each Leadgen Event
  for (const event of events) {
    try {
      const leadDetails = await fetchMetaLeadDetails(event.leadgen_id);
      const normalized = normalizeMetaLead({
        event,
        leadDetails,
        signatureVerified: isSignatureValid,
      });

      const routeResult = await routeMarketplaceLead(normalized, {
        explicitAccountId,
      });

      results.push({
        leadgenId: event.leadgen_id,
        status: routeResult.disposition,
        leadId: routeResult.leadId,
        message: routeResult.message,
      });
    } catch (err) {
      console.error(`Error processing Meta leadgen ${event.leadgen_id}:`, err);
      results.push({
        leadgenId: event.leadgen_id,
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  });
}
