import 'server-only';

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { smsSegmentCount } from '@/lib/sms-segments';
import { tryUsageOverage, type UsageOverageHold } from '@/lib/billing/usage-overage';

/**
 * DARK metering for text credits: reserve before a send, commit on a real
 * provider ID, release on anything else.
 *
 * The ledger shape is `ai-intake-usage.ts`'s, deliberately -- the roadmap's rule
 * is to extend one of the two existing enforcement patterns rather than invent a
 * third. What differs is the FAILURE POSTURE, and the difference is the whole
 * reason this is a separate file rather than a parameter.
 *
 * WHY THIS ONE MUST NOT FAIL CLOSED. AI Intake fails closed on any uncertainty:
 * when its ledger is unreachable it falls back to the ordinary quote form, and
 * the homeowner loses nothing. This channel carries appointment reminders,
 * arrival texts, payment receipts and card-update requests. A message not sent
 * because a ledger read timed out is a contractor standing on a roof whose
 * customer was never told they were coming -- strictly worse than a segment that
 * went unbilled.
 *
 * So the rule is: **refuse only on a definite answer.** `reserve_usage_credits`
 * raises P0001 with "insufficient usage credits" when the balance genuinely
 * cannot cover the send; that, and only that, is a refusal. Every other outcome
 * -- a timeout, a transport error, an unrecognised failure, no account to bill --
 * admits the message and says so in the decision, so the gap is visible rather
 * than silently absorbed.
 *
 * WHY TWO FLAGS. `LGQ_TEXT_CREDIT_METER_ENABLED` starts the ledger writing;
 * `LGQ_TEXT_CREDIT_GATE_ENABLED` additionally lets it refuse. Enforcement reads
 * BOTH, so it is structurally impossible to turn refusal on without having
 * measured first -- which is what roadmap item 1.5 asks for, expressed as a
 * type rather than as a note somebody has to remember.
 */

export const TEXT_CREDIT_METER_FLAG = 'LGQ_TEXT_CREDIT_METER_ENABLED';
export const TEXT_CREDIT_GATE_FLAG = 'LGQ_TEXT_CREDIT_GATE_ENABLED';

/** The resource code the price book and the credit ledger both use. */
export const TEXT_CREDIT_RESOURCE_CODE = 'text_segments';
export const TEXT_CREDIT_OPERATION_TYPE = 'text_send';

/** Matches ai-intake-usage.ts, and the sweeper that releases what outlives it. */
const RESERVATION_TTL_MS = 15 * 60 * 1000;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export type TextCreditMode = 'off' | 'measure' | 'enforce';

export function textCreditMode(env: ServerEnvironment = process.env): TextCreditMode {
  if (env[TEXT_CREDIT_METER_FLAG] !== '1') return 'off';
  return env[TEXT_CREDIT_GATE_FLAG] === '1' ? 'enforce' : 'measure';
}

export type TextCreditLease = Readonly<{
  reservationId: string;
  idempotencyKey: string;
  finalizationKey: string;
  segments: number;
  accountId: string;
  /**
   * False when this call found somebody else's live reservation under the same
   * key. Only the caller that created a reservation may finalize it, or a retry
   * would refund a send that is still in flight.
   */
  ownsReservation: boolean;
}>;

/** Why a message was allowed without a credit being held. */
export type TextCreditAdmission =
  | 'not_metered'
  | 'no_account'
  | 'ledger_unavailable'
  | 'exhausted_not_enforced';

/**
 * An overage that was authorized and accrued, and can be given back.
 *
 * THE CANONICAL SHAPE, not a copy of it. Each of the four meters carried its
 * own identical declaration, and a field added to one reached the others only
 * when somebody remembered. That is not hypothetical: `periodStart` was added
 * to fix a release that looked the period up itself and gave nothing back, and
 * the copies had to be chased one at a time. `idempotencyKey` is the second
 * such field, and this is the last time it has to be chased.
 */
export type TextCreditOverage = UsageOverageHold;

export type TextCreditDecision =
  | Readonly<{ outcome: 'allowed'; segments: number; lease: TextCreditLease }>
  | Readonly<{ outcome: 'allowed_overage'; segments: number; overage: TextCreditOverage }>
  | Readonly<{ outcome: 'allowed_unmetered'; segments: number; reason: TextCreditAdmission }>
  | Readonly<{ outcome: 'refused'; segments: number }>;

export type TextCreditInput = Readonly<{
  /** Null for messages with no workspace to bill, such as a signup verification code. */
  accountId: string | null;
  /** The exact body that will be handed to the carrier, after any opt-out line. */
  body: string;
  /**
   * Stable identity for this send. Two attempts at the same message must produce
   * the same key, or a retry buys a second set of credits.
   */
  messageKey: string;
}>;

function identityFor(messageKey: string) {
  const key = `text-credit:v1:${messageKey}`;
  return Object.freeze({ idempotencyKey: key, finalizationKey: `${key}:commit` });
}

/** The one error that means "the balance genuinely cannot cover this". */
function insufficientCredits(error: { code?: string; message?: string } | null): boolean {
  return error?.code === 'P0001' && /insufficient usage credits/i.test(error.message ?? '');
}

export async function beginTextCreditUsage(
  admin: SupabaseClient,
  input: TextCreditInput,
  options: Readonly<{ mode?: TextCreditMode; now?: () => Date }> = {},
): Promise<TextCreditDecision> {
  const segments = smsSegmentCount(input.body);
  const mode = options.mode ?? textCreditMode();

  if (mode === 'off') {
    return Object.freeze({ outcome: 'allowed_unmetered' as const, segments, reason: 'not_metered' as const });
  }
  if (!input.accountId) {
    // A verification code during signup has no workspace to bill. Reported
    // rather than ignored: if this appears on a message that SHOULD have an
    // account, the caller is the bug, not this decision.
    return Object.freeze({ outcome: 'allowed_unmetered' as const, segments, reason: 'no_account' as const });
  }

  const identity = identityFor(input.messageKey);
  const claimNonce = randomUUID().toLowerCase();
  const now = (options.now ?? (() => new Date()))();

  let reservationId: unknown = null;
  let reserveError: { code?: string; message?: string } | null = null;
  try {
    const result = await admin.rpc('reserve_usage_credits', {
      p_account_id: input.accountId,
      p_resource_code: TEXT_CREDIT_RESOURCE_CODE,
      p_units: segments,
      p_idempotency_key: identity.idempotencyKey,
      p_operation_type: TEXT_CREDIT_OPERATION_TYPE,
      p_expires_at: new Date(now.getTime() + RESERVATION_TTL_MS).toISOString(),
      p_metadata: { schema: 'text-credit.v1', claim_nonce: claimNonce, segments },
    });
    reservationId = result.data;
    reserveError = result.error;
  } catch {
    return Object.freeze({
      outcome: 'allowed_unmetered' as const, segments, reason: 'ledger_unavailable' as const,
    });
  }

  if (reserveError) {
    if (insufficientCredits(reserveError)) {
      // The only definite answer. Even here, refusal needs the gate as well as
      // the meter -- during the measure-only period an exhausted workspace still
      // sends, and the shortfall shows up as this reason instead.
      if (mode !== 'enforce') {
        return Object.freeze({
          outcome: 'allowed_unmetered' as const, segments, reason: 'exhausted_not_enforced' as const,
        });
      }

      // Out of allowance, and about to be refused. Overage is the only thing
      // that can turn that around, and only if the workspace asked for it and
      // set a cap -- see usage-overage.ts. It can never turn an allow into a
      // refusal, so asking here is safe.
      const overage = await tryUsageOverage(admin, {
        accountId: input.accountId,
        resourceCode: TEXT_CREDIT_RESOURCE_CODE,
        units: segments,
        // The reservation key, suffixed. A retry of the same send therefore
        // replays the same charge instead of adding a second one.
        idempotencyKey: `${identity.idempotencyKey}:overage`,
      });
      if (overage.outcome === 'accrued') {
        return Object.freeze({
          outcome: 'allowed_overage' as const,
          segments,
          overage: Object.freeze({
            resourceCode: TEXT_CREDIT_RESOURCE_CODE,
            units: segments,
            millicents: overage.chargedMillicents,
            periodStart: overage.periodStart,
            idempotencyKey: overage.idempotencyKey,
          }),
        });
      }
      return Object.freeze({ outcome: 'refused' as const, segments });
    }
    console.error('text credit reservation failed:', reserveError);
    return Object.freeze({
      outcome: 'allowed_unmetered' as const, segments, reason: 'ledger_unavailable' as const,
    });
  }

  if (typeof reservationId !== 'string' || !reservationId) {
    return Object.freeze({
      outcome: 'allowed_unmetered' as const, segments, reason: 'ledger_unavailable' as const,
    });
  }

  return Object.freeze({
    outcome: 'allowed' as const,
    segments,
    lease: Object.freeze({
      reservationId,
      idempotencyKey: identity.idempotencyKey,
      finalizationKey: identity.finalizationKey,
      segments,
      accountId: input.accountId,
      ownsReservation: true,
    }),
  });
}

/**
 * Spend the held credits. Call this ONLY on a real provider ID.
 *
 * `sendProviderMessage` returns `SIMULATED_PROVIDER_ID` when outbound SMS is
 * suppressed: the message was composed and addressed and went nowhere. That is
 * not a send, and billing it would charge a contractor for a text their customer
 * never received.
 */
export async function commitTextCreditUsage(
  admin: SupabaseClient,
  lease: TextCreditLease,
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

/**
 * Give the held credits back.
 *
 * A failure here is logged and swallowed. The alternative is throwing out of a
 * send path's error handler, which would replace a failed text with a failed
 * request -- and the expiry sweeper (`/api/cron/usage-reservation-expiry`)
 * releases anything this misses within the reservation's 15 minutes.
 */
export async function releaseTextCreditUsage(
  admin: SupabaseClient,
  lease: TextCreditLease,
  reason: string,
): Promise<boolean> {
  if (!lease.ownsReservation) return false;
  try {
    const { data, error } = await admin.rpc('release_usage_reservation', {
      p_reservation_id: lease.reservationId,
      p_finalization_key: lease.finalizationKey,
      p_reason: reason.slice(0, 500),
    });
    if (error) console.error('text credit release failed:', error);
    return !error && data === true;
  } catch (error) {
    console.error('text credit release threw:', error);
    return false;
  }
}
