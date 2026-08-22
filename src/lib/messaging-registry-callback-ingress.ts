/**
 * SignalWire 10DLC Campaign Registry status-callback ingress.
 *
 * This module exists because a carrier reason was lost once already. On
 * 2026-08-21 the individual number assignment for the LGQ shared number failed
 * and nothing recorded why: no `status_callback_url` had ever been registered,
 * so the transition was never delivered anywhere.
 *
 * Two facts shape every decision here, and both are load-bearing:
 *
 * 1. SignalWire's published 10DLC status-callback payload carries NO failure
 *    reason. Its documented fields are project_id, event_at, event_category,
 *    event_type, state, brand_id, campaign_id, number_assignment_order_id,
 *    number_assignment_id, phone_number_id and phone_number. There is no
 *    `reason`, `error`, or `description`. We still probe for those aliases
 *    because the docs are a subset of what providers actually send, but the
 *    design must not assume a reason will arrive.
 * 2. The exact wire shape -- method, content type, casing, envelope nesting,
 *    and whether the request is signed at all -- is not documented and has
 *    never been captured. So the raw bytes are the deliverable and the parse is
 *    a convenience that is explicitly allowed to yield nothing.
 *
 * Consequently: nothing in this file may reject, gate, or discard a delivery on
 * the basis of an unrecognized shape. A body we cannot read is still evidence,
 * and storing it unparsed is strictly better than a 4xx that asks the provider
 * to throw it away.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { parseSmsWebhookBody, webhookBodySha256 } from '@/lib/sms-webhook-ingress';

type WebhookObject = Record<string, unknown>;

/** Mirrors the CHECK on messaging_registry_callbacks.processing_status. */
export type RegistryCallbackDisposition =
  | 'received'
  | 'processed'
  | 'unmatched'
  | 'review'
  | 'ignored'
  | 'failed';

const DISPOSITIONS: ReadonlySet<string> = new Set<RegistryCallbackDisposition>([
  'received', 'processed', 'unmatched', 'review', 'ignored', 'failed',
]);

/**
 * Mirrors the CHECK on messaging_registry_callbacks.normalized_state.
 *
 * `unknown` is not decoration. The rest of the rail normalizes with a case
 * expression that maps anything outside complete/failed/rejected to `pending`;
 * if the registry spells its terminal state `FAILED`, `declined`, or `error`,
 * that convention would read a dead assignment as in-progress forever. An
 * unrecognized state must be visible, not silently benign.
 */
export type RegistryNormalizedState = 'complete' | 'failed' | 'pending' | 'unknown';

export type ParsedRegistryCallback = {
  parsed: WebhookObject | null;
  /** Set when the body could not be parsed. Never a reason to reject. */
  parseError: string | null;
  orderId: string | null;
  assignmentId: string | null;
  campaignId: string | null;
  phoneNumber: string | null;
  providerState: string | null;
  normalizedState: RegistryNormalizedState | null;
  failureCode: string | null;
  failureDetail: string | null;
  receiptKey: string;
  bodySha256: string;
};

/**
 * Field aliases. The first group of each list is what SignalWire documents; the
 * rest are GUESSES retained because the wire shape has never been captured.
 * Do not treat a hit on a guessed alias as proof of the contract.
 */
const ORDER_ALIASES = ['number_assignment_order_id', 'numberAssignmentOrderId', 'order_id', 'orderId'] as const;
const ASSIGNMENT_ALIASES = ['number_assignment_id', 'numberAssignmentId', 'assignment_id', 'assignmentId'] as const;
const CAMPAIGN_ALIASES = ['campaign_id', 'campaignId'] as const;
const NUMBER_ALIASES = ['phone_number', 'phoneNumber', 'number', 'to', 'To'] as const;
const STATE_ALIASES = ['state', 'status', 'assignment_state', 'order_state', 'event_type', 'eventType'] as const;
const EVENT_TYPE_ALIASES = ['event_type', 'eventType'] as const;
const REASON_ALIASES = [
  'reason', 'failure_reason', 'failureReason', 'error_message', 'errorMessage',
  'error', 'description', 'detail', 'message',
] as const;
const REASON_CODE_ALIASES = ['error_code', 'errorCode', 'failure_code', 'failureCode', 'code'] as const;

/**
 * Walk the payload plus any nested envelope objects, first alias wins,
 * case-insensitive. Mirrors the private helper in sms-webhook-ingress so a
 * Relay-style `{ params: { ... } }` wrapper does not hide every field.
 */
function objectsToSearch(payload: WebhookObject): WebhookObject[] {
  const found: WebhookObject[] = [payload];
  const queue: unknown[] = [payload.params, payload.data, payload.message, payload.event, payload.payload];
  while (queue.length > 0 && found.length < 12) {
    const value = queue.shift();
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const object = value as WebhookObject;
    if (found.includes(object)) continue;
    found.push(object);
    queue.push(object.params, object.data, object.message, object.event, object.payload);
  }
  return found;
}

function textField(payload: WebhookObject, aliases: readonly string[]): string | null {
  for (const alias of aliases) {
    for (const object of objectsToSearch(payload)) {
      let value: unknown;
      if (Object.prototype.hasOwnProperty.call(object, alias)) {
        value = object[alias];
      } else {
        const actual = Object.keys(object).find((key) => key.toLowerCase() === alias.toLowerCase());
        if (!actual) continue;
        value = object[actual];
      }
      if (Array.isArray(value)) value = value[0];
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') continue;
      const text = String(value).trim();
      if (text.length > 0) return text;
    }
  }
  return null;
}

/**
 * Map a provider state onto the rail's vocabulary.
 *
 * Anything unrecognized becomes `unknown`, never `pending`. See the type doc.
 */
export function normalizeRegistryState(
  providerState: string | null,
  eventType: string | null,
): RegistryNormalizedState | null {
  const candidates = [providerState, eventType]
    .map((value) => (value ?? '').trim().toLowerCase())
    .filter((value) => value.length > 0);
  if (candidates.length === 0) return null;

  for (const value of candidates) {
    if (value === 'complete' || value === 'completed' || value === 'active'
      || value === 'activated' || value === 'assigned' || value === 'success'
      || value === 'number_assignment_activated') {
      return 'complete';
    }
    if (value === 'failed' || value === 'failure' || value === 'rejected'
      || value === 'declined' || value === 'error'
      || value === 'number_assignment_failed') {
      return 'failed';
    }
    if (value === 'pending' || value === 'processing' || value === 'submitted'
      || value === 'in_progress' || value === 'processed'
      || value === 'number_assignment_pending'
      || value === 'number_assignment_order_processed') {
      return 'pending';
    }
  }
  return 'unknown';
}

/**
 * Clamp a parsed field to the width its column admits.
 *
 * NOT cosmetic. Every one of these lands in a CHECK-constrained column, and an
 * over-long value raises 23514 for the WHOLE insert -- so the raw bytes would
 * never be stored, and every redelivery would fail identically. That is the
 * exact outcome this module exists to prevent: a body we cannot fully interpret
 * is still evidence. Truncating an identifier loses a little; losing the row
 * loses everything.
 */
function cap(value: string | null, max: number): string | null {
  if (value === null) return null;
  return value.length <= max ? value : value.slice(0, max);
}

/** Coerce a provider code onto the rail's failure_code shape, or drop it. */
function normalizeFailureCode(raw: string | null): string | null {
  if (!raw) return null;
  const slug = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!/^[a-z][a-z0-9_]{2,99}$/.test(slug)) return null;
  return slug;
}

/**
 * Interpret a delivery. Never throws on a malformed body: an unreadable payload
 * returns `parsed: null` with the reason recorded, because the bytes are what
 * matter and a throw here would become a 5xx that discards them.
 */
export function parseRegistryCallback(rawBody: string, contentType: string | null): ParsedRegistryCallback {
  const bodySha256 = webhookBodySha256(rawBody);

  let parsed: WebhookObject | null = null;
  let parseError: string | null = null;
  try {
    parsed = parseSmsWebhookBody(rawBody, contentType) as WebhookObject;
  } catch (error) {
    // parseSmsWebhookBody throws on any media type outside JSON and form. The
    // registry surface has never been captured, so this is an expected path.
    parseError = error instanceof Error ? error.message : 'Unparseable registry callback body.';
    parsed = null;
  }

  if (!parsed) {
    return {
      parsed: null,
      parseError,
      orderId: null,
      assignmentId: null,
      campaignId: null,
      phoneNumber: null,
      providerState: null,
      normalizedState: null,
      failureCode: null,
      failureDetail: null,
      // With no readable identity, the bytes are the identity. A byte-identical
      // redelivery still dedupes; a different body is a different event.
      receiptKey: `sha256:${bodySha256}`,
      bodySha256,
    };
  }

  // Widths mirror the CHECK constraints on messaging_registry_callbacks.
  const orderId = cap(textField(parsed, ORDER_ALIASES), 200);
  const assignmentId = cap(textField(parsed, ASSIGNMENT_ALIASES), 200);
  const campaignId = cap(textField(parsed, CAMPAIGN_ALIASES), 200);
  const phoneNumber = cap(textField(parsed, NUMBER_ALIASES), 32);
  const eventType = textField(parsed, EVENT_TYPE_ALIASES);
  const providerState = cap(textField(parsed, STATE_ALIASES), 200);
  const failureDetail = textField(parsed, REASON_ALIASES);
  const failureCode = normalizeFailureCode(textField(parsed, REASON_CODE_ALIASES));

  // Identity plus digest. Identity alone would collapse two genuine transitions
  // that share an order id; digest alone would let a reworded duplicate through.
  const identity = [orderId ?? '-', assignmentId ?? '-', providerState ?? '-'].join(':');
  const receiptKey = `${identity}:${bodySha256}`.slice(0, 700);

  return {
    parsed,
    parseError: null,
    orderId,
    assignmentId,
    campaignId,
    phoneNumber,
    providerState,
    normalizedState: normalizeRegistryState(providerState, eventType),
    failureCode,
    failureDetail,
    receiptKey,
    bodySha256,
  };
}

export type RegistryIngestResult = {
  callbackId: string;
  inserted: boolean;
  applicationId: string | null;
  disposition: RegistryCallbackDisposition;
};

function oneRow(data: unknown, operation: string): Record<string, unknown> {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') throw new Error(`${operation} returned no row.`);
  return row as Record<string, unknown>;
}

/**
 * Store a delivery.
 *
 * The result is asserted, not merely checked for an error. On this codebase a
 * write that matches zero rows returns no error, so `if (error) throw` proves
 * only that the statement was accepted -- never that anything was recorded.
 */
export async function ingestRegistryCallback(
  admin: SupabaseClient,
  input: Readonly<{
    parsed: ParsedRegistryCallback;
    rawBody: string;
    contentType: string | null;
    requestMethod: string;
    requestPath: string;
    requestHeaders: Record<string, unknown>;
    signatureHeaderName: string | null;
    signatureHeaderValue: string | null;
    failureDetail: string | null;
  }>,
): Promise<RegistryIngestResult> {
  const { parsed } = input;
  const { data, error } = await admin.rpc('ingest_messaging_registry_callback', {
    p_receipt_key: parsed.receiptKey,
    p_body_sha256: parsed.bodySha256,
    p_raw_body: input.rawBody,
    p_content_type: input.contentType,
    p_request_method: input.requestMethod,
    p_request_path: input.requestPath,
    p_request_headers: input.requestHeaders,
    p_signature_header_name: input.signatureHeaderName,
    p_signature_header_value: input.signatureHeaderValue,
    p_parsed: parsed.parsed,
    p_provider_order_id: parsed.orderId,
    p_provider_assignment_id: parsed.assignmentId,
    p_provider_campaign_id: parsed.campaignId,
    p_provider_phone_number: parsed.phoneNumber,
    p_provider_state: parsed.providerState,
    p_normalized_state: parsed.normalizedState,
    p_failure_code: parsed.failureCode,
    p_failure_detail: input.failureDetail,
  });

  if (error) throw new Error(`Unable to store the SignalWire registry callback: ${error.message}`);

  const row = oneRow(data, 'ingest_messaging_registry_callback');
  const callbackId = row.callback_id;
  const disposition = row.disposition;
  if (typeof callbackId !== 'string' || callbackId.length === 0) {
    throw new Error('ingest_messaging_registry_callback returned no callback id.');
  }
  if (typeof disposition !== 'string' || !DISPOSITIONS.has(disposition)) {
    throw new Error('ingest_messaging_registry_callback returned an invalid disposition.');
  }

  const applicationId = row.matched_application_id;
  return {
    callbackId,
    inserted: row.inserted === true,
    applicationId: typeof applicationId === 'string' ? applicationId : null,
    disposition: disposition as RegistryCallbackDisposition,
  };
}
