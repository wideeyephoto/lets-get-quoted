import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUsPhone } from '@/lib/phone';
import type { SmsProviderId } from '@/lib/sms-provider';
import { enqueueSmsDelivery, type SmsSenderPurpose } from '@/lib/sms-delivery';
import { APP_ORIGIN } from '@/lib/app-origin';

type WebhookObject = Record<string, unknown>;

export type InboundKeyword = 'stop' | 'start' | 'help' | 'other';

export type ParsedInboundWebhook = {
  providerEventId: string;
  receiptKey: string;
  fromNumber: string;
  toNumber: string;
  body: string;
  mediaUrls: string[];
  keyword: InboundKeyword;
  providerHandledKeyword: boolean;
};

export type ParsedStatusWebhook = {
  providerEventId: string;
  providerStatus: string;
  providerErrorCode: string | null;
  receiptKey: string;
};

export type InboundIngressResult = {
  disposition: 'routed' | 'review' | 'duplicate' | 'keyword_stop' | 'keyword_start' | 'keyword_help';
  receiptId: string;
  accountId: string | null;
  senderNumberId: string | null;
  senderPurpose: 'lgq_shared' | 'lgq_dispatch' | 'contractor_dedicated' | null;
};

export type InboundReplyKind =
  | 'keyword_start'
  | 'keyword_help'
  | 'offer'
  | 'reschedule'
  | 'appointment_confirmation'
  | 'subcontractor'
  | 'ambiguity';

const INBOUND_REPLY_EVENT: Readonly<Record<InboundReplyKind, Readonly<{
  messageKind: string;
  eventType: string;
}>>> = Object.freeze({
  keyword_start: Object.freeze({ messageKind: 'inbound-start-reply', eventType: 'inbound_start_reply' }),
  keyword_help: Object.freeze({ messageKind: 'inbound-help-reply', eventType: 'inbound_help_reply' }),
  offer: Object.freeze({ messageKind: 'inbound-offer-reply', eventType: 'inbound_offer_reply' }),
  reschedule: Object.freeze({ messageKind: 'inbound-reschedule-reply', eventType: 'inbound_reschedule_reply' }),
  appointment_confirmation: Object.freeze({
    messageKind: 'inbound-appointment-reply',
    eventType: 'inbound_appointment_reply',
  }),
  subcontractor: Object.freeze({
    messageKind: 'inbound-subcontractor-reply',
    eventType: 'inbound_subcontractor_reply',
  }),
  ambiguity: Object.freeze({
    messageKind: 'inbound-ambiguity-reply',
    eventType: 'inbound_ambiguity_reply',
  }),
});

/**
 * A reply inherits the authenticated sender's audience, not the domain action
 * that happened to produce its words. The final database gate maps these three
 * categories to customer, crew, and owner consent scopes respectively.
 */
function inboundReplyBillingCategory(senderPurpose: SmsSenderPurpose) {
  if (senderPurpose === 'lgq_dispatch') return 'crew_message' as const;
  if (senderPurpose === 'lgq_shared') return 'owner_alert' as const;
  return 'customer_message' as const;
}

/**
 * Provider retries must resolve to the same durable reply intent without putting
 * an unaudited provider-native ID into the database key. The digest is derived
 * from the provider and exact inbound event ID; reply kind keeps two deliberate
 * replies to one inbound event from colliding.
 */
export function inboundReplyIdempotencyKey(
  provider: SmsProviderId,
  providerEventId: string,
  kind: InboundReplyKind,
): string {
  const digest = createHash('sha256')
    .update(`${provider}\0${providerEventId}`, 'utf8')
    .digest('hex');
  return `inbound-reply:${provider}:${kind}:${digest}`;
}

/** Queue a reply on the exact authenticated inbound sender-number binding. */
export async function enqueueInboundReply(
  admin: SupabaseClient,
  input: Readonly<{
    provider: SmsProviderId;
    providerEventId: string;
    accountId: string;
    senderNumberId: string;
    senderPurpose: SmsSenderPurpose;
    phoneNumber: string;
    body: string;
    kind: InboundReplyKind;
  }>,
): Promise<string> {
  const event = INBOUND_REPLY_EVENT[input.kind];
  const queued = await enqueueSmsDelivery({
    accountId: input.accountId,
    phoneNumber: input.phoneNumber,
    body: input.body,
    messageKind: event.messageKind,
    billingCategory: inboundReplyBillingCategory(input.senderPurpose),
    senderPurpose: input.senderPurpose,
    context: 'automation',
    eventType: event.eventType,
    idempotencyKey: inboundReplyIdempotencyKey(
      input.provider,
      input.providerEventId,
      input.kind,
    ),
    senderNumberId: input.senderNumberId,
  }, admin);
  return queued.eventId;
}

export type StatusIngressResult = {
  disposition: 'applied' | 'duplicate' | 'ignored_stale' | 'ignored_terminal' | 'review';
  receiptId: string;
  smsEventId: string | null;
  previousStatus: string | null;
  projectedStatus: string | null;
};

const STOP = new Set([
  'STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT',
  'REVOKE', 'OPTOUT', 'OPT-OUT',
  'ALTO', 'DETENER', 'CANCELAR',
]);
const START = new Set(['START', 'UNSTOP', 'REANUDAR']);
const HELP = new Set(['HELP', 'INFO', 'AYUDA']);

export function webhookBodySha256(rawBody: string): string {
  return createHash('sha256').update(rawBody, 'utf8').digest('hex');
}

/**
 * Parse only the two carrier formats LGQ authenticates.
 *
 * URLSearchParams preserves repeated values in arrival order. JSON remains an
 * object so Relay-style nested `params` / `message` payloads can be read without
 * normalizing the signed bytes before their hash is recorded.
 */
export function parseSmsWebhookBody(rawBody: string, contentType: string | null): WebhookObject {
  const mediaType = (contentType ?? '').split(';', 1)[0].trim().toLowerCase();
  if (mediaType === 'application/json' || mediaType.endsWith('+json')) {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON webhook body must be an object.');
    }
    return parsed as WebhookObject;
  }
  if (mediaType === 'application/x-www-form-urlencoded' || mediaType === '') {
    const result: WebhookObject = {};
    const params = new URLSearchParams(rawBody);
    for (const key of new Set(params.keys())) {
      const values = params.getAll(key);
      result[key] = values.length === 1 ? values[0] : values;
    }
    return result;
  }
  throw new Error(`Unsupported SMS webhook content type: ${mediaType || 'missing'}.`);
}

function objectsToSearch(payload: WebhookObject): WebhookObject[] {
  const found: WebhookObject[] = [payload];
  const queue: unknown[] = [payload.params, payload.data, payload.message, payload.event];
  while (queue.length > 0 && found.length < 12) {
    const value = queue.shift();
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const object = value as WebhookObject;
    if (found.includes(object)) continue;
    found.push(object);
    queue.push(object.params, object.data, object.message, object.event);
  }
  return found;
}

function field(payload: WebhookObject, aliases: readonly string[]): unknown {
  const objects = objectsToSearch(payload);
  // Prefer a provider-specific name anywhere in the envelope before accepting
  // a generic nested `id` / `state`. Relay envelopes can have their own event
  // ID as well as the message ID we need for callback identity.
  for (const alias of aliases) {
    for (const object of objects) {
      if (Object.prototype.hasOwnProperty.call(object, alias)) return object[alias];
      const actual = Object.keys(object).find((key) => key.toLowerCase() === alias.toLowerCase());
      if (actual) return object[actual];
    }
  }
  return undefined;
}

function textField(payload: WebhookObject, aliases: readonly string[]): string {
  const value = field(payload, aliases);
  if (Array.isArray(value)) return String(value[0] ?? '').trim();
  return value === null || value === undefined ? '' : String(value).trim();
}

function normalizeProviderId(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 255 ? trimmed : null;
}

function classifyKeyword(body: string): InboundKeyword {
  const first = body.trim().toUpperCase().split(/\s+/, 1)[0] ?? '';
  if (STOP.has(first)) return 'stop';
  if (START.has(first)) return 'start';
  if (HELP.has(first)) return 'help';
  return 'other';
}

function mediaUrls(payload: WebhookObject): string[] {
  const direct = field(payload, ['media', 'media_urls', 'mediaUrls']);
  const result: string[] = [];
  if (Array.isArray(direct)) {
    for (const value of direct) {
      const url = String(value ?? '').trim();
      if (url.startsWith('https://') && !result.includes(url)) result.push(url);
      if (result.length === 10) return result;
    }
  }

  const count = Math.min(Math.max(0, Number(textField(payload, ['NumMedia', 'num_media'])) || 0), 10);
  for (let index = 0; index < count; index += 1) {
    const url = textField(payload, [`MediaUrl${index}`, `media_url_${index}`]);
    if (url.startsWith('https://') && !result.includes(url)) result.push(url);
  }
  return result;
}

export function extractInboundWebhook(payload: WebhookObject): ParsedInboundWebhook | null {
  const providerEventId = normalizeProviderId(
    textField(payload, ['MessageSid', 'SmsSid', 'message_id', 'messageId', 'id']),
  );
  const fromNumber = normalizeUsPhone(textField(payload, ['From', 'from', 'from_number', 'fromNumber']));
  const toNumber = normalizeUsPhone(textField(payload, ['To', 'to', 'to_number', 'toNumber']));
  if (!providerEventId || !fromNumber || !toNumber) return null;

  const body = textField(payload, ['Body', 'body']).slice(0, 5000);
  const providerOptOutType = textField(payload, ['OptOutType', 'opt_out_type', 'optOutType']);
  return {
    providerEventId,
    receiptKey: providerEventId,
    fromNumber,
    toNumber,
    body,
    mediaUrls: mediaUrls(payload),
    keyword: classifyKeyword(body),
    providerHandledKeyword: providerOptOutType.length > 0,
  };
}

export function extractStatusWebhook(payload: WebhookObject): ParsedStatusWebhook | null {
  const providerEventId = normalizeProviderId(
    textField(payload, ['MessageSid', 'SmsSid', 'message_id', 'messageId', 'id']),
  );
  const providerStatus = textField(payload, [
    'MessageStatus', 'SmsStatus', 'message_status', 'messageStatus', 'state',
  ]).toLowerCase();
  if (!providerEventId || !providerStatus || providerStatus.length > 100) return null;
  const errorCode = textField(payload, [
    'ErrorCode', 'ErrorMessage', 'error_code', 'errorCode', 'reason',
  ]).slice(0, 255) || null;
  return {
    providerEventId,
    providerStatus,
    providerErrorCode: errorCode,
    receiptKey: `${providerEventId}:${providerStatus}:${errorCode ?? '-'}`,
  };
}

function oneRow(data: unknown, operation: string): Record<string, unknown> {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') throw new Error(`${operation} returned no row.`);
  return row as Record<string, unknown>;
}

export async function ingestInboundWebhook(
  admin: SupabaseClient,
  input: ParsedInboundWebhook & {
    provider: SmsProviderId;
    rawBody: string;
    contentType: string | null;
    requestUrl: string;
  },
): Promise<InboundIngressResult> {
  const { data, error } = await admin.rpc('ingest_sms_inbound_webhook', {
    p_provider: input.provider,
    p_provider_event_id: input.providerEventId,
    p_receipt_key: input.receiptKey,
    p_body_sha256: webhookBodySha256(input.rawBody),
    p_content_type: input.contentType,
    p_request_url: input.requestUrl,
    p_from_number: input.fromNumber,
    p_to_number: input.toNumber,
    p_message_body: input.body,
    p_media_urls: input.mediaUrls,
    p_keyword: input.keyword,
  });
  if (error) throw new Error(`Inbound SMS receipt failed: ${error.message}`);
  const row = oneRow(data, 'Inbound SMS receipt');
  return {
    disposition: String(row.ingress_disposition) as InboundIngressResult['disposition'],
    receiptId: String(row.webhook_receipt_id),
    accountId: row.routed_account_id ? String(row.routed_account_id) : null,
    senderNumberId: row.routed_sender_number_id ? String(row.routed_sender_number_id) : null,
    senderPurpose: row.routed_sender_purpose
      ? String(row.routed_sender_purpose) as InboundIngressResult['senderPurpose']
      : null,
  };
}

/**
 * A duplicate ingest intentionally returns only `duplicate`. Read the immutable
 * receipt disposition when the HTTP route needs to replay a deterministic
 * compliance response. Ordinary replies never use this as a processing flag;
 * their receipt-keyed action task is the source of truth.
 */
export async function loadInboundReceiptDisposition(
  admin: SupabaseClient,
  webhookReceiptId: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc('get_sms_inbound_receipt_disposition', {
    p_webhook_receipt_id: webhookReceiptId,
  });
  if (error) throw new Error(`Inbound SMS receipt lookup failed: ${error.message}`);
  return typeof data === 'string' && data ? data : null;
}

export async function applyStatusWebhook(
  admin: SupabaseClient,
  input: ParsedStatusWebhook & {
    provider: SmsProviderId;
    rawBody: string;
    contentType: string | null;
    requestUrl: string;
  },
): Promise<StatusIngressResult> {
  const { data, error } = await admin.rpc('apply_sms_delivery_status_webhook', {
    p_provider: input.provider,
    p_provider_event_id: input.providerEventId,
    p_provider_status: input.providerStatus,
    p_provider_error_code: input.providerErrorCode,
    p_receipt_key: input.receiptKey,
    p_body_sha256: webhookBodySha256(input.rawBody),
    p_content_type: input.contentType,
    p_request_url: input.requestUrl,
  });
  if (error) throw new Error(`SMS status receipt failed: ${error.message}`);
  const row = oneRow(data, 'SMS status receipt');
  return {
    disposition: String(row.status_disposition) as StatusIngressResult['disposition'],
    receiptId: String(row.webhook_receipt_id),
    smsEventId: row.sms_event_id ? String(row.sms_event_id) : null,
    previousStatus: row.previous_status ? String(row.previous_status) : null,
    projectedStatus: row.projected_status ? String(row.projected_status) : null,
  };
}

export async function recordInvalidWebhook(
  admin: SupabaseClient,
  input: {
    provider: SmsProviderId;
    kind: 'inbound' | 'status';
    rawBody: string;
    contentType: string | null;
    requestUrl: string;
    providerEventId?: string | null;
    fromNumber?: string | null;
    toNumber?: string | null;
    body?: string | null;
    status?: string | null;
    errorCode?: string | null;
  },
): Promise<void> {
  const hash = webhookBodySha256(input.rawBody);
  const providerEventId = normalizeProviderId(input.providerEventId ?? '') ?? `missing-${hash.slice(0, 32)}`;
  const { error } = await admin.rpc('record_sms_webhook_review', {
    p_provider: input.provider,
    p_webhook_kind: input.kind,
    p_provider_event_id: providerEventId,
    p_receipt_key: `invalid:${providerEventId}:${hash}`,
    p_body_sha256: hash,
    p_content_type: input.contentType,
    p_request_url: input.requestUrl,
    p_reason: 'invalid_payload',
    p_from_number: input.fromNumber ?? null,
    p_to_number: input.toNumber ?? null,
    p_message_body: input.body?.slice(0, 5000) ?? null,
    p_provider_status: input.status?.slice(0, 100) ?? null,
    p_provider_error_code: input.errorCode?.slice(0, 255) ?? null,
  });
  if (error) throw new Error(`Invalid SMS webhook receipt failed: ${error.message}`);
}

export function sharedNoticeText(brand: string): string {
  return `${brand}: Alerts only, replies not monitored. View your client portal: ${APP_ORIGIN}/portal Reply STOP to opt out.`;
}
