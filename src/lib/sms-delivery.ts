import 'server-only';

import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/auth';
import type { SmsBillingCategory } from '@/lib/sms-billing-policy';
import { getTcpaCompliantSendTime, resolveRecipientTimeZone } from '@/lib/phone-timezone';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE = /^\+[1-9][0-9]{7,14}$/;
const NAME = /^[a-z][a-z0-9_-]{2,99}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9:._/-]{2,199}$/;

export type SmsDeliveryContext =
  | 'payment'
  | 'crew'
  | 'subcontractor'
  | 'owner'
  | 'customer'
  | 'automation'
  | 'platform';

export type SmsSenderPurpose =
  | 'lgq_shared'
  | 'lgq_dispatch'
  | 'contractor_dedicated';

export type EnqueueSmsDeliveryInput = Readonly<{
  accountId: string;
  phoneNumber: string;
  body: string;
  messageKind: string;
  billingCategory: SmsBillingCategory;
  senderPurpose?: SmsSenderPurpose;
  context: SmsDeliveryContext;
  eventType?: string;
  idempotencyKey?: string;
  paymentId?: string | null;
  crewId?: string | null;
  senderNumberId?: string | null;
  availableAt?: Date | string | null;
  bypassQuietHours?: boolean;
}>;

export type EnqueuedSmsDelivery = Readonly<{
  eventId: string;
  state: string;
  created: boolean;
}>;

function requiredUuid(value: string, label: string): string {
  if (!UUID.test(value)) throw new Error(`${label} must be a UUID.`);
  return value.toLowerCase();
}

function nullableUuid(value: string | null | undefined, label: string): string | null {
  return value == null ? null : requiredUuid(value, label);
}

function requiredName(value: string, label: string): string {
  if (!NAME.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function row(value: unknown): Record<string, unknown> {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('SMS enqueue returned an invalid result.');
  }
  return candidate as Record<string, unknown>;
}

export function senderPurposeFor(category: SmsBillingCategory): SmsSenderPurpose {
  if (category === 'owner_alert') return 'lgq_shared';
  if (category === 'crew_message') return 'lgq_dispatch';
  // Customer, payment, and lead-verification traffic speaks for the independent
  // contractor. It must never escape on LGQ's shared Campaign.
  return 'contractor_dedicated';
}

export function newSmsIdempotencyKey(messageKind: string): string {
  return `sms:${requiredName(messageKind, 'SMS message kind')}:${randomUUID()}`;
}

/**
 * Records delivery intent and its one queue task in a single transaction.
 *
 * Domain producers should pass a stable idempotency key derived from the
 * business transition. The generated fallback is reserved for an intentional
 * one-off manual action that has no pre-existing domain key.
 */
export async function enqueueSmsDelivery(
  input: EnqueueSmsDeliveryInput,
  admin: SupabaseClient = createAdminClient(),
): Promise<EnqueuedSmsDelivery> {
  const accountId = requiredUuid(input.accountId, 'SMS account id');
  if (!PHONE.test(input.phoneNumber)) throw new Error('SMS destination must be E.164.');
  if (!input.body || input.body.length > 5000) throw new Error('SMS body length is invalid.');
  const messageKind = requiredName(input.messageKind, 'SMS message kind');
  const eventType = requiredName(input.eventType ?? messageKind.replace(/-/g, '_'), 'SMS event type');
  const idempotencyKey = input.idempotencyKey ?? newSmsIdempotencyKey(messageKind);
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) throw new Error('SMS idempotency key is invalid.');

  let availableAt = input.availableAt;
  if (!availableAt && !input.bypassQuietHours && input.billingCategory === 'customer_message') {
    const tz = resolveRecipientTimeZone({ phone: input.phoneNumber });
    const check = getTcpaCompliantSendTime(new Date(), tz);
    if (check.isDelayed) {
      availableAt = check.sendAt;
    }
  }

  const { data, error } = await admin.rpc('enqueue_sms_delivery', {
    p_account_id: accountId,
    p_phone_number: input.phoneNumber,
    p_body: input.body,
    p_message_kind: messageKind,
    p_billing_category: input.billingCategory,
    p_sender_purpose: input.senderPurpose ?? senderPurposeFor(input.billingCategory),
    p_context: input.context,
    p_event_type: eventType,
    p_idempotency_key: idempotencyKey,
    p_payment_id: nullableUuid(input.paymentId, 'SMS payment id'),
    p_crew_id: nullableUuid(input.crewId, 'SMS crew id'),
    p_sender_number_id: nullableUuid(input.senderNumberId, 'SMS sender number id'),
    p_available_at: availableAt
      ? typeof availableAt === 'string'
        ? availableAt
        : availableAt.toISOString()
      : null,
  });

  if (error) throw new Error(`SMS enqueue failed (${error.code || 'unknown'}).`);
  const result = row(data);
  const eventId = typeof result.sms_event_id === 'string'
    ? requiredUuid(result.sms_event_id, 'Queued SMS event id')
    : null;
  if (!eventId || typeof result.task_state !== 'string' || typeof result.created !== 'boolean') {
    throw new Error('SMS enqueue returned an invalid result.');
  }
  return Object.freeze({
    eventId,
    state: result.task_state,
    created: result.created,
  });
}
