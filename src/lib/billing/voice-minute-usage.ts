import 'server-only';

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { tryUsageOverage, type UsageOverageHold } from '@/lib/billing/usage-overage';

/**
 * DARK metering for AI Voice Receptionist minutes.
 *
 * THE FOURTH METER, AND THE FIRST THAT CANNOT KNOW WHAT IT IS SPENDING. The
 * other three reserve exactly what they are about to use: one credit per email,
 * one per draft, one per carrier segment, all countable before the work starts.
 * A phone call is not. LGQ has to admit it before anyone can say how long it
 * runs, and the provider's receipt arrives only when it is over
 * (docs/ai-voice-v1-decisions.md §11).
 *
 * So this meter reserves the published 60-minute safety cap and settles the
 * truth afterwards through `commit_usage_reservation_partial`, which exists for
 * exactly this. Reserving the cap is what makes a spending limit mean something
 * while the call is still running: two concurrent calls cannot each believe the
 * last minute is theirs.
 *
 * WHY IT FAILS OPEN, WHERE AI WRITING FAILS CLOSED. When the ledger cannot
 * answer, this admits the call unmetered and says so.
 *
 * A draft that fails closed costs somebody a retry. A receptionist that fails
 * closed sends every caller to voicemail during the outage — for a product whose
 * whole promise is "your phone keeps working when you can't answer", bought for
 * $55–69 a month. And the exposure from failing open is bounded and recoverable
 * in a way the other meters' is not: bounded, because a call cannot exceed the
 * 60-minute cap and concurrency is capped per plan; recoverable, because the
 * receipt still arrives, so an unmetered admission can be reconciled afterwards
 * from evidence rather than guessed at. Text credits fail open for a different
 * reason and AI writing fails closed for a third; the disagreement is why these
 * are still four files.
 *
 * An exhausted allowance is NOT uncertainty. That refuses — and refusing here
 * means the caller follows the contractor's own forwarding or voicemail rule,
 * which is the behaviour the pricing FAQ already publishes.
 */

export const VOICE_MINUTE_METER_FLAG = 'LGQ_VOICE_MINUTE_METER_ENABLED';
export const VOICE_MINUTE_GATE_FLAG = 'LGQ_VOICE_MINUTE_GATE_ENABLED';

export const VOICE_MINUTE_RESOURCE_CODE = 'voice_minutes';
export const VOICE_MINUTE_OPERATION_TYPE = 'ai_voice_minute';

/** Published in the pricing FAQ: no single call may run longer than this. */
export const VOICE_CALL_CAP_MINUTES = 60;

/**
 * A hold must outlive the longest call it could be covering, or the expiry
 * sweeper releases a live call's minutes mid-conversation. 90 = the 60-minute
 * cap plus room for clock skew and a late receipt.
 *
 * KNOWN CONSEQUENCE, see §11: `reserve_usage_credits` only draws on credit lots
 * that outlive the reservation, so in the last 90 minutes of a billing period a
 * plan-period lot expiring at period end is ineligible and a call refuses while
 * the credits are visibly there. The fix is a tail on the lot, not a shorter
 * hold — a shorter hold would trade a monthly refusal for a mid-call release.
 */
const RESERVATION_TTL_MS = 90 * 60 * 1000;

const MICROSECONDS_PER_MINUTE = 60_000_000;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export type VoiceMinuteMode = 'off' | 'measure' | 'enforce';

export function voiceMinuteMode(env: ServerEnvironment = process.env): VoiceMinuteMode {
  if (env[VOICE_MINUTE_METER_FLAG] !== '1') return 'off';
  return env[VOICE_MINUTE_GATE_FLAG] === '1' ? 'enforce' : 'measure';
}

export type VoiceMinuteLease = Readonly<{
  reservationId: string;
  finalizationKey: string;
  accountId: string;
  providerCallId: string;
  reservedMinutes: number;
  ownsReservation: boolean;
}>;

export type VoiceAdmission =
  | 'not_metered'
  /** The ledger could not answer. Recoverable: the receipt still arrives. */
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
export type { UsageOverageHold };

export type VoiceMinuteDecision =
  | Readonly<{ outcome: 'admitted'; lease: VoiceMinuteLease }>
  | Readonly<{ outcome: 'admitted_overage'; overage: UsageOverageHold }>
  | Readonly<{ outcome: 'admitted_unmetered'; reason: VoiceAdmission }>
  /** Follow the contractor's forwarding or voicemail rule. Not an error. */
  | Readonly<{ outcome: 'refused' }>;

export type VoiceAdmissionInput = Readonly<{
  accountId: string;
  /** The provider's call id. The join to the receipt, and to nothing else. */
  providerCallId: string;
}>;

/**
 * The five microsecond timestamps the measured receipt carries. There is no
 * duration field; see §11 for why the absence is an improvement.
 */
export type VoiceReceiptTimings = Readonly<{
  ai_start_date?: unknown;
  ai_end_date?: unknown;
}>;

function microseconds(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * What a call actually costs, from the receipt.
 *
 * `ai_start_date`..`ai_end_date` and nothing else. That interval sits strictly
 * inside the answered window — measured at 0.429s after answer and 0.002s before
 * end — so ringing, and any transfer leg after the AI hands off, are excluded by
 * construction rather than by a subtraction somebody has to remember.
 *
 * Rounds UP to a whole minute, first minute always charged. `floor` would bill
 * the measured 32.8-second call as nothing at all.
 *
 * Returns null when the receipt cannot support a bill, which must never be
 * silently treated as zero: zero is a settlement, null is a reconciliation.
 */
export function billableVoiceMinutes(
  receipt: VoiceReceiptTimings,
  capMinutes = VOICE_CALL_CAP_MINUTES,
): number | null {
  const start = microseconds(receipt.ai_start_date);
  const end = microseconds(receipt.ai_end_date);
  if (start === null || end === null || end < start) return null;

  const elapsed = end - start;
  // A connected call always costs at least its first minute; an AI session of
  // literally zero length never happened and is not billed.
  if (elapsed === 0) return 0;
  return Math.min(capMinutes, Math.ceil(elapsed / MICROSECONDS_PER_MINUTE));
}

function insufficientCredits(error: { code?: string; message?: string } | null): boolean {
  return error?.code === 'P0001' && /insufficient usage credits/i.test(error.message ?? '');
}

/**
 * Reserve the cap and record the admission, in that order.
 *
 * The admission row is what makes an unauthenticated receipt safe: a receipt
 * whose call id matches no admission settles nothing. It is written even when
 * the call is admitted unmetered, because the receipt for THAT call still needs
 * to be attributable to a workspace.
 */
export async function admitVoiceCall(
  admin: SupabaseClient,
  input: VoiceAdmissionInput,
  options: Readonly<{ mode?: VoiceMinuteMode; now?: () => Date; capMinutes?: number }> = {},
): Promise<VoiceMinuteDecision> {
  const mode = options.mode ?? voiceMinuteMode();
  const cap = options.capMinutes ?? VOICE_CALL_CAP_MINUTES;

  if (mode === 'off') {
    return Object.freeze({ outcome: 'admitted_unmetered' as const, reason: 'not_metered' as const });
  }

  const idempotencyKey = `ai-voice:v1:${input.providerCallId}`;
  const finalizationKey = `${idempotencyKey}:settle`;
  const now = (options.now ?? (() => new Date()))();

  let reservationId: unknown = null;
  let reserveError: { code?: string; message?: string } | null = null;
  try {
    const result = await admin.rpc('reserve_usage_credits', {
      p_account_id: input.accountId,
      p_resource_code: VOICE_MINUTE_RESOURCE_CODE,
      p_units: cap,
      p_idempotency_key: idempotencyKey,
      p_operation_type: VOICE_MINUTE_OPERATION_TYPE,
      p_expires_at: new Date(now.getTime() + RESERVATION_TTL_MS).toISOString(),
      p_metadata: { schema: 'ai-voice.v1', claim_nonce: randomUUID().toLowerCase() },
    });
    reservationId = result.data;
    reserveError = result.error;
  } catch {
    await recordAdmission(admin, input, null, 0);
    return Object.freeze({
      outcome: 'admitted_unmetered' as const, reason: 'ledger_unavailable' as const,
    });
  }

  if (reserveError) {
    if (insufficientCredits(reserveError)) {
      if (mode !== 'enforce') {
        await recordAdmission(admin, input, null, 0);
        return Object.freeze({
          outcome: 'admitted_unmetered' as const, reason: 'exhausted_not_enforced' as const,
        });
      }

      // Out of allowance and about to send the caller to voicemail. Overage can
      // only turn that around, never the other way, and only when the workspace
      // asked for it and set a cap.
      const overage = await tryUsageOverage(admin, {
        accountId: input.accountId,
        resourceCode: VOICE_MINUTE_RESOURCE_CODE,
        units: cap,
        // The reservation key, suffixed. A retry of the same send therefore
        // replays the same charge instead of adding a second one.
        idempotencyKey: `${idempotencyKey}:overage`,
      });
      if (overage.outcome === 'accrued') {
        await recordAdmission(admin, input, null, 0);
        return Object.freeze({
          outcome: 'admitted_overage' as const,
          overage: Object.freeze({
            resourceCode: VOICE_MINUTE_RESOURCE_CODE,
            units: cap,
            millicents: overage.chargedMillicents,
            periodStart: overage.periodStart,
            idempotencyKey: overage.idempotencyKey,
          }),
        });
      }
      // No admission row: the call is not being answered by the AI, so there
      // will be no receipt to attribute.
      return Object.freeze({ outcome: 'refused' as const });
    }
    console.error('voice minute reservation failed:', reserveError);
    await recordAdmission(admin, input, null, 0);
    return Object.freeze({
      outcome: 'admitted_unmetered' as const, reason: 'ledger_unavailable' as const,
    });
  }

  if (typeof reservationId !== 'string' || !reservationId) {
    await recordAdmission(admin, input, null, 0);
    return Object.freeze({
      outcome: 'admitted_unmetered' as const, reason: 'ledger_unavailable' as const,
    });
  }

  await recordAdmission(admin, input, reservationId, cap);
  return Object.freeze({
    outcome: 'admitted' as const,
    lease: Object.freeze({
      reservationId,
      finalizationKey,
      accountId: input.accountId,
      providerCallId: input.providerCallId,
      reservedMinutes: cap,
      ownsReservation: true,
    }),
  });
}

/** Never throws: a failure here must not stop the caller being answered. */
async function recordAdmission(
  admin: SupabaseClient,
  input: VoiceAdmissionInput,
  reservationId: string | null,
  reservedMinutes: number,
): Promise<void> {
  try {
    const { error } = await admin.from('voice_call_admissions').upsert({
      account_id: input.accountId,
      provider: 'signalwire',
      provider_call_id: input.providerCallId,
      reservation_id: reservationId,
      reserved_minutes: reservedMinutes,
    }, { onConflict: 'provider,provider_call_id', ignoreDuplicates: true });
    if (error) console.error('voice admission record failed:', error);
  } catch (error) {
    console.error('voice admission record threw:', error);
  }
}

/**
 * Settle the hold against what the receipt says was used.
 *
 * Returns the minutes actually committed, or null when nothing could be settled.
 * Null is not zero: zero means a call that cost nothing, null means a hold this
 * did not resolve, and only one of those is finished business.
 */
export async function settleVoiceCall(
  admin: SupabaseClient,
  lease: VoiceMinuteLease,
  minutes: number,
): Promise<number | null> {
  if (!lease.ownsReservation) return null;
  if (!Number.isSafeInteger(minutes) || minutes < 0) return null;
  try {
    const { data, error } = await admin.rpc('commit_usage_reservation_partial', {
      p_reservation_id: lease.reservationId,
      p_finalization_key: lease.finalizationKey,
      p_units: Math.min(minutes, lease.reservedMinutes),
    });
    if (error) {
      console.error('voice minute settlement failed:', error);
      return null;
    }
    const settled = typeof data === 'number' ? data : Number(data);
    return Number.isFinite(settled) ? settled : null;
  } catch (error) {
    console.error('voice minute settlement threw:', error);
    return null;
  }
}

/**
 * Give the whole hold back. For a call that never connected, or one the provider
 * never reported — which it does not, for a call that failed while connecting.
 *
 * Never throws: it runs in an error path, and the expiry sweeper releases
 * anything this misses within the reservation's 90 minutes.
 */
export async function releaseVoiceCall(
  admin: SupabaseClient,
  lease: VoiceMinuteLease,
  reason: string,
): Promise<boolean> {
  if (!lease.ownsReservation) return false;
  try {
    const { data, error } = await admin.rpc('release_usage_reservation', {
      p_reservation_id: lease.reservationId,
      p_finalization_key: lease.finalizationKey,
      p_reason: reason.slice(0, 500),
    });
    if (error) console.error('voice minute release failed:', error);
    return !error && data === true;
  } catch (error) {
    console.error('voice minute release threw:', error);
    return false;
  }
}
