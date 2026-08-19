import 'server-only';

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * DARK metering for AI writing drafts: one credit per generation.
 *
 * The third module in this shape, after `text-credit-usage.ts` and
 * `marketing-email-usage.ts`. At three it is worth saying why they are still
 * separate files rather than one parameterised core: **they disagree about the
 * thing that matters most**, which is what happens when the ledger cannot
 * answer.
 *
 *  - Text credits must never refuse on uncertainty. That channel carries
 *    appointment reminders and payment receipts.
 *  - Marketing email may refuse one recipient but never a campaign.
 *  - This one may refuse outright, and does. A model call is discretionary, it
 *    is slow and expensive, the contractor is sitting in front of it waiting,
 *    and a draft that silently arrives unbilled is a draft nobody can account
 *    for. Failing closed here costs somebody a retry; failing open costs money
 *    on every generation.
 *
 * A shared core would have to carry that difference as a flag, and a flag is a
 * worse place for it than a paragraph.
 */

export const AI_WRITING_METER_FLAG = 'LGQ_AI_WRITING_METER_ENABLED';
export const AI_WRITING_GATE_FLAG = 'LGQ_AI_WRITING_GATE_ENABLED';

export const AI_WRITING_RESOURCE_CODE = 'ai_writing_drafts';
export const AI_WRITING_OPERATION_TYPE = 'ai_writing_draft';

const RESERVATION_TTL_MS = 15 * 60 * 1000;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export type AiWritingMode = 'off' | 'measure' | 'enforce';

export function aiWritingMode(env: ServerEnvironment = process.env): AiWritingMode {
  if (env[AI_WRITING_METER_FLAG] !== '1') return 'off';
  return env[AI_WRITING_GATE_FLAG] === '1' ? 'enforce' : 'measure';
}

export type AiWritingLease = Readonly<{
  reservationId: string;
  finalizationKey: string;
  accountId: string;
  ownsReservation: boolean;
}>;

export type AiWritingAdmission = 'not_metered' | 'ledger_unavailable' | 'exhausted_not_enforced';

export type AiWritingDecision =
  | Readonly<{ outcome: 'allowed'; lease: AiWritingLease }>
  | Readonly<{ outcome: 'allowed_unmetered'; reason: AiWritingAdmission }>
  | Readonly<{ outcome: 'refused' }>;

export type AiWritingInput = Readonly<{
  accountId: string;
  /** Stable identity for this generation. A retry is a new draft, and bills. */
  generationKey: string;
}>;

function insufficientCredits(error: { code?: string; message?: string } | null): boolean {
  return error?.code === 'P0001' && /insufficient usage credits/i.test(error.message ?? '');
}

export async function beginAiWritingUsage(
  admin: SupabaseClient,
  input: AiWritingInput,
  options: Readonly<{ mode?: AiWritingMode; now?: () => Date }> = {},
): Promise<AiWritingDecision> {
  const mode = options.mode ?? aiWritingMode();
  if (mode === 'off') {
    return Object.freeze({ outcome: 'allowed_unmetered' as const, reason: 'not_metered' as const });
  }

  const idempotencyKey = `ai-writing:v1:${input.generationKey}`;
  const finalizationKey = `${idempotencyKey}:commit`;
  const now = (options.now ?? (() => new Date()))();

  let reservationId: unknown = null;
  let reserveError: { code?: string; message?: string } | null = null;
  try {
    const result = await admin.rpc('reserve_usage_credits', {
      p_account_id: input.accountId,
      p_resource_code: AI_WRITING_RESOURCE_CODE,
      p_units: 1,
      p_idempotency_key: idempotencyKey,
      p_operation_type: AI_WRITING_OPERATION_TYPE,
      p_expires_at: new Date(now.getTime() + RESERVATION_TTL_MS).toISOString(),
      p_metadata: { schema: 'ai-writing.v1', claim_nonce: randomUUID().toLowerCase() },
    });
    reservationId = result.data;
    reserveError = result.error;
  } catch {
    return Object.freeze({
      outcome: 'allowed_unmetered' as const, reason: 'ledger_unavailable' as const,
    });
  }

  if (reserveError) {
    if (insufficientCredits(reserveError)) {
      return mode === 'enforce'
        ? Object.freeze({ outcome: 'refused' as const })
        : Object.freeze({
          outcome: 'allowed_unmetered' as const, reason: 'exhausted_not_enforced' as const,
        });
    }
    console.error('ai writing reservation failed:', reserveError);
    return Object.freeze({
      outcome: 'allowed_unmetered' as const, reason: 'ledger_unavailable' as const,
    });
  }

  if (typeof reservationId !== 'string' || !reservationId) {
    return Object.freeze({
      outcome: 'allowed_unmetered' as const, reason: 'ledger_unavailable' as const,
    });
  }

  return Object.freeze({
    outcome: 'allowed' as const,
    lease: Object.freeze({
      reservationId, finalizationKey, accountId: input.accountId, ownsReservation: true,
    }),
  });
}

/** Spend the held draft. Call only once the model has actually produced one. */
export async function commitAiWritingUsage(
  admin: SupabaseClient,
  lease: AiWritingLease,
): Promise<boolean> {
  if (!lease.ownsReservation) return false;
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

/** Give the held draft back. Never throws: it runs in the caller's error path. */
export async function releaseAiWritingUsage(
  admin: SupabaseClient,
  lease: AiWritingLease,
  reason: string,
): Promise<boolean> {
  if (!lease.ownsReservation) return false;
  try {
    const { data, error } = await admin.rpc('release_usage_reservation', {
      p_reservation_id: lease.reservationId,
      p_finalization_key: lease.finalizationKey,
      p_reason: reason.slice(0, 500),
    });
    if (error) console.error('ai writing release failed:', error);
    return !error && data === true;
  } catch (error) {
    console.error('ai writing release threw:', error);
    return false;
  }
}
