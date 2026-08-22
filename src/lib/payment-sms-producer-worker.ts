import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/auth';
import { sendPaymentSmsEvent, type PaymentSmsEvent } from '@/lib/sms';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENTS = new Set<PaymentSmsEvent>([
  'payment_paid', 'payment_failed', 'payment_refunded',
]);

export type PaymentSmsProducerClaim = Readonly<{
  taskId: string;
  claimToken: string;
  paymentId: string;
  eventType: PaymentSmsEvent;
  attemptNumber: number;
}>;

export interface PaymentSmsProducerStore {
  claimBatch(batchSize: number): Promise<readonly PaymentSmsProducerClaim[]>;
  complete(
    claim: PaymentSmsProducerClaim,
    outcome: 'queued' | 'duplicate' | 'skipped' | 'opted_out' | 'superseded',
    eventId: string | null,
  ): Promise<void>;
  fail(claim: PaymentSmsProducerClaim, errorCode: string, retryable: boolean): Promise<void>;
}

type RpcError = Readonly<{ code?: string }>;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Payment SMS producer claim is malformed.');
  }
  return value as Record<string, unknown>;
}

function uuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new Error(`${label} is malformed.`);
  }
  return value.toLowerCase();
}

function rpcError(error: RpcError | null): Error {
  return new Error(`Payment SMS producer database operation failed (${error?.code || 'unknown'}).`);
}

function parseClaim(value: unknown): PaymentSmsProducerClaim {
  const row = record(value);
  const eventType = row.event_type;
  const attempt = typeof row.attempt_number === 'string'
    ? Number(row.attempt_number) : row.attempt_number;
  if (typeof eventType !== 'string' || !EVENTS.has(eventType as PaymentSmsEvent)
      || typeof attempt !== 'number' || !Number.isSafeInteger(attempt)
      || attempt < 1 || attempt > 8) {
    throw new Error('Payment SMS producer claim is malformed.');
  }
  return Object.freeze({
    taskId: uuid(row.task_id, 'Payment SMS producer task id'),
    claimToken: uuid(row.work_claim_token, 'Payment SMS producer claim token'),
    paymentId: uuid(row.payment_id, 'Payment SMS producer payment id'),
    eventType: eventType as PaymentSmsEvent,
    attemptNumber: attempt,
  });
}

export function createPaymentSmsProducerStore(
  admin: SupabaseClient = createAdminClient(),
): PaymentSmsProducerStore {
  return Object.freeze({
    async claimBatch(batchSize: number) {
      const { data, error } = await admin.rpc('claim_payment_sms_producer_tasks', {
        p_batch_size: batchSize,
      });
      if (error) throw rpcError(error);
      if (!Array.isArray(data)) throw new Error('Payment SMS producer claim batch is malformed.');
      return data.map(parseClaim);
    },
    async complete(
      claim: PaymentSmsProducerClaim,
      outcome: 'queued' | 'duplicate' | 'skipped' | 'opted_out' | 'superseded',
      eventId: string | null,
    ) {
      const { data, error } = await admin.rpc('complete_payment_sms_producer_task', {
        p_task_id: claim.taskId,
        p_claim_token: claim.claimToken,
        p_outcome: outcome,
        p_sms_event_id: eventId,
      });
      if (error) throw rpcError(error);
      if (data !== true) throw new Error('Payment SMS producer completion was not acknowledged.');
    },
    async fail(
      claim: PaymentSmsProducerClaim,
      errorCode: string,
      retryable: boolean,
    ) {
      const { data, error } = await admin.rpc('fail_payment_sms_producer_task', {
        p_task_id: claim.taskId,
        p_claim_token: claim.claimToken,
        p_error_code: errorCode,
        p_retryable: retryable,
      });
      if (error) throw rpcError(error);
      if (data !== 'retry_wait' && data !== 'dead_letter') {
        throw new Error('Payment SMS producer failure was not acknowledged.');
      }
    },
  });
}

export type PaymentSmsProducerBatchResult = Readonly<{
  claimed: number;
  completed: number;
  failed: number;
}>;

export async function runPaymentSmsProducerBatch(
  batchSize = 20,
  store: PaymentSmsProducerStore = createPaymentSmsProducerStore(),
  send: typeof sendPaymentSmsEvent = sendPaymentSmsEvent,
): Promise<PaymentSmsProducerBatchResult> {
  const claims = await store.claimBatch(batchSize);
  let completed = 0;
  let failed = 0;

  for (const claim of claims) {
    try {
      const result = await send(claim.paymentId, claim.eventType);
      if (result.status === 'queued' || result.status === 'duplicate') {
        if (!result.eventId || !UUID.test(result.eventId)) {
          throw new Error('Payment SMS enqueue returned no event identity.');
        }
        await store.complete(claim, result.status, result.eventId.toLowerCase());
      } else if (result.status === 'skipped' || result.status === 'opted_out') {
        await store.complete(claim, result.status, null);
      } else {
        await store.fail(claim, 'payment_sms_enqueue_failed', true);
        failed += 1;
        continue;
      }
      completed += 1;
    } catch {
      try {
        await store.fail(claim, 'payment_sms_producer_failed', true);
      } finally {
        failed += 1;
      }
    }
  }

  return Object.freeze({ claimed: claims.length, completed, failed });
}
