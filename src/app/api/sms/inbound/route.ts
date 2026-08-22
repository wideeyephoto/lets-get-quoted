import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import {
  hasSignatureHeader,
  outboundSmsLaneSuppression,
  validateWebhookSignature,
} from '@/lib/sms-provider';
import {
  extractInboundWebhook,
  ingestInboundWebhook,
  loadInboundReceiptDisposition,
  parseSmsWebhookBody,
  recordInvalidWebhook,
  type InboundIngressResult,
  type ParsedInboundWebhook,
} from '@/lib/sms-webhook-ingress';
import { processSmsInboundActionReceipt } from '@/lib/sms-inbound-action-worker';
import { logWebhookFailure } from '@/lib/webhook-failures';

export const runtime = 'nodejs';

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function emptyTwiml(status = 200) {
  return new NextResponse(EMPTY_TWIML, {
    status,
    headers: { 'Content-Type': 'text/xml' },
  });
}

type SynchronousComplianceKeyword = 'stop' | 'start' | 'help';

/**
 * The only synchronous carrier egress left in the callback route.
 *
 * Compliance acknowledgements cannot use the ordinary durable outbox: STOP is
 * intentionally blocked by its consent gates, while first-ever START and HELP
 * may not have customer-scope consent. The authenticated receipt and
 * sender-scoped keyword preference are committed before this response is built,
 * and ordinary/intent replies never use it. A receipt-keyed audit row makes the
 * synchronous exception explicit; webhook retries return empty TwiML so they do
 * not ask the carrier to send the acknowledgement twice.
 */
async function minimumComplianceKeywordTwiml(
  admin: SupabaseClient,
  webhookReceiptId: string,
  keyword: SynchronousComplianceKeyword,
  brand: string,
  accountId: string | null,
  senderPurpose: InboundIngressResult['senderPurpose'],
): Promise<NextResponse> {
  // A carrier reply verb asks the carrier to send a text and is therefore subject
  // to the same unconditional test/Preview/kill switch, account canary, and
  // purpose release gates as the durable worker. An unknown shared-number
  // association cannot prove canary membership and is suppressed while a
  // canary allow-list is active.
  const message = keyword === 'stop'
    ? `${brand}: You are unsubscribed and will no longer receive texts from this number. Reply START to resume.`
    : keyword === 'start'
      ? `${brand}: You are re-subscribed to texts from this number. Reply STOP to opt out.`
      : `${brand} support: hello@letsgetquoted.com. Reply STOP to opt out. Message and data rates may apply.`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
  const suppressed = outboundSmsLaneSuppression(accountId, senderPurpose) !== null;
  const responseBody = suppressed ? EMPTY_TWIML : twiml;
  const { data, error } = await admin.rpc('record_sms_compliance_reply_result', {
    p_webhook_receipt_id: webhookReceiptId,
    p_keyword: keyword,
    p_egress_result: suppressed ? 'suppressed' : 'twiml',
    p_response_body_sha256: createHash('sha256').update(responseBody, 'utf8').digest('hex'),
  });
  if (error) {
    throw new Error(`SMS compliance reply audit failed${error?.code ? ` (${error.code})` : ''}.`);
  }
  // The RPC is an atomic claim: only the request that inserted the immutable
  // receipt result may return the carrier Message verb. A concurrent request or a
  // later provider retry receives empty TwiML.
  if (data !== true) return emptyTwiml();
  return new NextResponse(
    responseBody,
    { status: 200, headers: { 'Content-Type': 'text/xml' } },
  );
}

function rejected() {
  return emptyTwiml(403);
}

async function senderName(admin: SupabaseClient, accountId: string | null): Promise<string> {
  if (!accountId) return "Let's Get Quoted";
  const { data } = await admin
    .from('accounts')
    .select('business_name')
    .eq('id', accountId)
    .maybeSingle();
  const value = String(data?.business_name ?? '').trim();
  return value && value !== 'My Business' ? value : "Let's Get Quoted";
}

type ReplyBinding = Readonly<{
  accountId: string;
  senderNumberId: string;
  senderPurpose: NonNullable<InboundIngressResult['senderPurpose']>;
}>;

function exactReplyBinding(ingress: InboundIngressResult): ReplyBinding | null {
  if (!ingress.accountId || !ingress.senderNumberId || !ingress.senderPurpose) return null;
  return Object.freeze({
    accountId: ingress.accountId,
    senderNumberId: ingress.senderNumberId,
    senderPurpose: ingress.senderPurpose,
  });
}

export async function POST(request: Request) {
  if (!hasSignatureHeader(request)) {
    await logWebhookFailure({ source: 'sms_inbound', errorMessage: 'Missing provider signature header' });
    return rejected();
  }

  const rawBody = await request.clone().text();
  const check = validateWebhookSignature(request, rawBody);
  if (!check.ok) {
    await logWebhookFailure({
      source: 'sms_inbound',
      referenceId: null,
      errorMessage: `Signature validation failed: ${check.reason}`,
    });
    return rejected();
  }

  const contentType = request.headers.get('content-type');
  const admin = createAdminClient();
  let inbound: ParsedInboundWebhook | null = null;
  try {
    const payload = parseSmsWebhookBody(rawBody, contentType);
    inbound = extractInboundWebhook(payload);
  } catch (error) {
    console.error('Inbound SMS payload parse failed:', error);
  }

  if (!inbound) {
    try {
      await recordInvalidWebhook(admin, {
        provider: check.provider,
        kind: 'inbound',
        rawBody,
        contentType,
        requestUrl: request.url,
      });
    } catch (error) {
      await logWebhookFailure({
        source: 'sms_inbound',
        referenceId: null,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return emptyTwiml(503);
    }
    return emptyTwiml();
  }

  try {
    const ingress = await ingestInboundWebhook(admin, {
      ...inbound,
      provider: check.provider,
      rawBody,
      contentType,
      requestUrl: request.url,
    });

    if (ingress.disposition === 'review') return emptyTwiml();
    const effectiveDisposition = ingress.disposition === 'duplicate'
      ? await loadInboundReceiptDisposition(admin, ingress.receiptId)
      : ingress.disposition;
    if (inbound.providerHandledKeyword) return emptyTwiml();

    const brand = await senderName(admin, ingress.accountId);
    const binding = exactReplyBinding(ingress);
    if (effectiveDisposition === 'keyword_stop') {
      return await minimumComplianceKeywordTwiml(
        admin, ingress.receiptId, 'stop', brand, ingress.accountId, ingress.senderPurpose,
      );
    }
    if (effectiveDisposition === 'keyword_start') {
      return await minimumComplianceKeywordTwiml(
        admin, ingress.receiptId, 'start', brand, ingress.accountId, ingress.senderPurpose,
      );
    }
    if (effectiveDisposition === 'keyword_help') {
      return await minimumComplianceKeywordTwiml(
        admin, ingress.receiptId, 'help', brand, ingress.accountId, ingress.senderPurpose,
      );
    }

    if (!binding || effectiveDisposition !== 'routed') return emptyTwiml();
    const actionStatus = await processSmsInboundActionReceipt(ingress.receiptId, admin);
    if (actionStatus === 'busy' || actionStatus === 'deferred'
        || (actionStatus === 'missing' && ingress.disposition !== 'duplicate')) {
      // The receipt is durable, but no worker currently owns a retryable action.
      // A non-2xx response asks the carrier to deliver the same receipt again;
      // receipt dedupe then resumes the same task rather than applying twice.
      return emptyTwiml(503);
    }
    return emptyTwiml();
  } catch (error) {
    console.error('Inbound SMS webhook handler threw:', error);
    await logWebhookFailure({
      source: 'sms_inbound',
      referenceId: inbound.providerEventId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return emptyTwiml(503);
  }
}
