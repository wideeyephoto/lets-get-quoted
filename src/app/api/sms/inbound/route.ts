import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { APP_ORIGIN } from '@/lib/app-origin';
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

/**
 * The courtesy answer for LGQ's OWN numbers.
 *
 * WHAT PROBLEM THIS SOLVES. The shared number sends account alerts to the
 * contractor and nothing else. Replying to it used to produce total silence: a
 * consented owner's message was filed for review, and an unrecognised sender's
 * went nowhere. Texting a business number and getting nothing back is worse
 * than either a monitored inbox or an honest automated answer.
 *
 * WHY THE COPY SAYS NOTHING ABOUT BUYING A NUMBER. The registered campaign is
 * LOW_VOLUME_MIXED / CUSTOMER_CARE + ACCOUNT_NOTIFICATION, and its TCR
 * description states that no MARKETING is carried. A reply promoting a paid
 * dedicated number would be marketing on a campaign that declares it sends
 * none -- a mismatch on a carrier-audited field. The text states a capability
 * limit and points at the dashboard; the dashboard is free to sell, because the
 * dashboard is not a carrier-governed surface.
 *
 * ONE SEGMENT, AND THE CHARACTER SET IS LOAD-BEARING. Every reply is billed per
 * segment. Plain ASCII stays in GSM-7 where a segment is 160 characters; a
 * single non-GSM-7 character -- an em dash, a curly apostrophe -- silently
 * promotes the WHOLE message to UCS-2, where a segment is 70. The first draft
 * of this string used an em dash and cost three segments instead of one. Keep it
 * ASCII, and keep it short; the test beside this asserts both.
 *
 * NEVER FOR A DEDICATED NUMBER. A contractor's own number is a real two-way
 * conversation with their customer; auto-answering it on their behalf would be
 * putting words in their mouth. The database function enforces this too.
 */
const SHARED_NOTICE_LANES = new Set(['lgq_shared', 'lgq_dispatch']);

export function sharedNoticeText(brand: string): string {
  return `${brand}: Alerts only, replies not monitored. View your client portal: ${APP_ORIGIN}/portal Reply STOP to opt out.`;
}

/**
 * Answer with the notice, or empty TwiML if anything says no.
 *
 * Mirrors minimumComplianceKeywordTwiml's shape deliberately: the same lane
 * suppression check, and an atomic claim so a provider retry cannot text the
 * same person twice. It is a SEPARATE audit table because a courtesy reply is
 * not a compliance acknowledgement -- see the migration for why conflating them
 * would weaken the compliance invariant.
 */
async function sharedNoticeTwiml(
  admin: SupabaseClient,
  ingress: InboundIngressResult,
  brand: string,
): Promise<NextResponse> {
  if (!ingress.senderPurpose || !SHARED_NOTICE_LANES.has(ingress.senderPurpose)) {
    return emptyTwiml();
  }
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(sharedNoticeText(brand))}</Message></Response>`;
  // A carrier Message verb is an outbound text. It answers to the same kill
  // switch, canary allow-list and lane gates as the durable worker -- otherwise
  // a "dark" deployment would still be texting people.
  const suppressed = outboundSmsLaneSuppression(ingress.accountId, ingress.senderPurpose) !== null;
  const responseBody = suppressed ? EMPTY_TWIML : twiml;

  let claimed = false;
  try {
    const { data, error } = await admin.rpc('record_sms_shared_notice_reply', {
      p_webhook_receipt_id: ingress.receiptId,
      p_egress_result: suppressed ? 'suppressed' : 'twiml',
      p_response_body_sha256: createHash('sha256').update(responseBody, 'utf8').digest('hex'),
    });
    if (error) throw new Error(error.message);
    claimed = data === true;
  } catch (error) {
    // A courtesy reply is not worth failing the webhook over. The receipt is
    // already durable; staying silent loses a nicety, while a 5xx here would
    // ask the carrier to redeliver a message we have already stored.
    await logWebhookFailure({
      source: 'sms_inbound',
      errorMessage: `Shared-number notice reply not recorded: ${error instanceof Error ? error.message : String(error)}`,
    });
    return emptyTwiml();
  }

  if (!claimed || suppressed) return emptyTwiml();
  return new NextResponse(responseBody, { status: 200, headers: { 'Content-Type': 'text/xml' } });
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

    // `review` still means no human action is taken -- but on LGQ's own lanes it
    // is precisely the unroutable-reply case, the one with no other answer. The
    // notice is the only thing that changes; nothing is routed or applied.
    if (ingress.disposition === 'review') {
      return await sharedNoticeTwiml(admin, ingress, await senderName(admin, ingress.accountId));
    }
    const effectiveDisposition = ingress.disposition === 'duplicate'
      ? await loadInboundReceiptDisposition(admin, ingress.receiptId)
      : ingress.disposition;
    // The provider already answered this one; a second Message verb would
    // double-text the sender.
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

    // Unbound or unrouted on a platform lane: still answer. This is the ordinary
    // "someone replied to an alert" path.
    if (!binding || effectiveDisposition !== 'routed') {
      return await sharedNoticeTwiml(admin, ingress, brand);
    }
    const actionStatus = await processSmsInboundActionReceipt(ingress.receiptId, admin);
    if (actionStatus === 'busy' || actionStatus === 'deferred'
        || (actionStatus === 'missing' && ingress.disposition !== 'duplicate')) {
      // The receipt is durable, but no worker currently owns a retryable action.
      // A non-2xx response asks the carrier to deliver the same receipt again;
      // receipt dedupe then resumes the same task rather than applying twice.
      //
      // Deliberately BEFORE the notice: a redelivery must find no notice claim,
      // or the retry would be answered while its action is still unfinished.
      return emptyTwiml(503);
    }
    // Routed and applied. The action ran; the notice tells the sender where the
    // result actually lives, because this number will not carry a conversation.
    return await sharedNoticeTwiml(admin, ingress, brand);
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
