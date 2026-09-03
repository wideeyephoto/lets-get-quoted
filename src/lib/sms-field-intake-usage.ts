import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESOURCE_CODE = 'ai_intake_threads';
const OPERATION_TYPE = 'ai_intake';
// Eight five-minute worker attempts plus exponential retry delays and one-minute
// cron jitter fit within 70 minutes. Ninety minutes keeps a useful safety margin
// without making otherwise usable plan credits look exhausted for the final
// 23 hours before their allowance lot resets.
const RESERVATION_TTL_MS = 90 * 60 * 1000;

export type SmsFieldIntakeUsageLease = Readonly<{
  reservationId: string;
  finalizationKey: string;
  needsCommit: boolean;
}>;

export type SmsFieldIntakeUsageAdmission =
  | Readonly<{ kind: 'allowed'; lease: SmsFieldIntakeUsageLease }>
  | Readonly<{ kind: 'no_credits' }>
  | Readonly<{ kind: 'unavailable' }>;

function insufficientCredits(error: { code?: string; message?: string } | null): boolean {
  return error?.code === 'P0001' && /insufficient usage credits/i.test(error.message ?? '');
}

function identity(taskId: string): Readonly<{
  idempotencyKey: string;
  finalizationKey: string;
}> {
  return Object.freeze({
    // Preserve the key used by the previously dormant worker so a retry or
    // rollout cannot bill the same durable task twice.
    idempotencyKey: `field-intake-ai-${taskId}`,
    finalizationKey: `field-intake-ai-commit-${taskId}`,
  });
}

/**
 * Reserve one AI-intake credit before calling the model.
 *
 * This rail fails closed: an unavailable ledger never becomes a paid provider
 * call, and an exhausted account gets a deterministic no-credit result. The
 * reservation lives long enough to cover the inbound task's bounded retries;
 * an abandoned task is refunded by the normal reservation-expiry worker.
 */
export async function beginSmsFieldIntakeUsage(
  admin: SupabaseClient,
  input: Readonly<{ accountId: string; taskId: string }>,
  now: Date = new Date(),
): Promise<SmsFieldIntakeUsageAdmission> {
  const keys = identity(input.taskId);
  let reservationId: unknown;
  let reserveError: { code?: string; message?: string } | null;
  try {
    const result = await admin.rpc('reserve_usage_credits', {
      p_account_id: input.accountId,
      p_resource_code: RESOURCE_CODE,
      p_units: 1,
      p_idempotency_key: keys.idempotencyKey,
      p_operation_type: OPERATION_TYPE,
      p_expires_at: new Date(now.getTime() + RESERVATION_TTL_MS).toISOString(),
      p_metadata: {
        schema: 'sms_field_intake_v1',
        task_id: input.taskId,
      },
    });
    reservationId = result.data;
    reserveError = result.error;
  } catch {
    return Object.freeze({ kind: 'unavailable' });
  }

  if (reserveError) {
    return Object.freeze({
      kind: insufficientCredits(reserveError) ? 'no_credits' : 'unavailable',
    });
  }
  if (typeof reservationId !== 'string' || !UUID.test(reservationId)) {
    return Object.freeze({ kind: 'unavailable' });
  }

  try {
    const { data, error } = await admin
      .from('usage_reservations')
      .select('id, account_id, resource_code, operation_type, idempotency_key, state, expires_at, finalization_key')
      .eq('id', reservationId)
      .eq('account_id', input.accountId)
      .maybeSingle();
    if (error || !data
        || data.id !== reservationId
        || data.account_id !== input.accountId
        || data.resource_code !== RESOURCE_CODE
        || data.operation_type !== OPERATION_TYPE
        || data.idempotency_key !== keys.idempotencyKey) {
      return Object.freeze({ kind: 'unavailable' });
    }
    if (data.state === 'committed' && data.finalization_key === keys.finalizationKey) {
      return Object.freeze({
        kind: 'allowed',
        lease: Object.freeze({
          reservationId,
          finalizationKey: keys.finalizationKey,
          needsCommit: false,
        }),
      });
    }
    if (data.state !== 'reserved'
        || !Number.isFinite(Date.parse(String(data.expires_at)))
        || Date.parse(String(data.expires_at)) <= now.getTime()) {
      return Object.freeze({ kind: 'unavailable' });
    }
    return Object.freeze({
      kind: 'allowed',
      lease: Object.freeze({
        reservationId,
        finalizationKey: keys.finalizationKey,
        needsCommit: true,
      }),
    });
  } catch {
    return Object.freeze({ kind: 'unavailable' });
  }
}

/** Spend the reserved credit after Gemini answered, before applying its action. */
export async function commitSmsFieldIntakeUsage(
  admin: SupabaseClient,
  lease: SmsFieldIntakeUsageLease,
): Promise<boolean> {
  if (!lease.needsCommit) return true;
  try {
    const { data, error } = await admin.rpc('commit_usage_reservation', {
      p_reservation_id: lease.reservationId,
      p_finalization_key: lease.finalizationKey,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
