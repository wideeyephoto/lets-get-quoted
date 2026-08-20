import 'server-only';

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { tryUsageOverage, type UsageOverageHold } from '@/lib/billing/usage-overage';

/**
 * DARK metering for marketing email sends: one credit per delivered recipient.
 *
 * SHAPE. Deliberately the same reserve/commit/release shape as
 * `text-credit-usage.ts` and `ai-intake-usage.ts`. When the AI-writing meter
 * lands and there are three of these, the common core is worth extracting -- two
 * is not yet enough to know which parts are actually common, and the two that
 * exist already disagree about the thing that matters most, which is what
 * happens when the ledger cannot answer.
 *
 * WHY ONE RESERVATION PER RECIPIENT rather than one for the audience.
 * `commit_usage_reservation` takes no unit count: a reservation commits whole or
 * releases whole. Reserving the whole audience up front would mean either
 * billing for a campaign that died on recipient three, or inventing a
 * partial-commit RPC. A campaign is capped at 250 recipients in batches of
 * eight, so per-recipient reservations are bounded, exact, and need no new SQL.
 *
 * WHY THIS ONE MAY REFUSE ON UNCERTAINTY, WHERE TEXT MAY NOT. Text credits carry
 * appointment reminders and payment receipts; refusing one because a ledger read
 * timed out hurts the homeowner. A marketing campaign is discretionary and the
 * contractor is watching it run. But it may only refuse ONE recipient, never the
 * campaign: `sendCampaign` already counts a per-recipient failure and continues,
 * so an unbillable recipient lands in the failure count the contractor is shown
 * rather than silently truncating a send they believe went out.
 */

export const MARKETING_EMAIL_METER_FLAG = 'LGQ_MARKETING_EMAIL_METER_ENABLED';
export const MARKETING_EMAIL_GATE_FLAG = 'LGQ_MARKETING_EMAIL_GATE_ENABLED';

export const MARKETING_EMAIL_RESOURCE_CODE = 'marketing_email_sends';
export const MARKETING_EMAIL_OPERATION_TYPE = 'marketing_email_send';

const RESERVATION_TTL_MS = 15 * 60 * 1000;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export type MarketingEmailMode = 'off' | 'measure' | 'enforce';

export function marketingEmailMode(env: ServerEnvironment = process.env): MarketingEmailMode {
  if (env[MARKETING_EMAIL_METER_FLAG] !== '1') return 'off';
  return env[MARKETING_EMAIL_GATE_FLAG] === '1' ? 'enforce' : 'measure';
}

export type MarketingEmailLease = Readonly<{
  reservationId: string;
  finalizationKey: string;
  accountId: string;
  ownsReservation: boolean;
}>;

export type MarketingEmailAdmission =
  | 'not_metered'
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

export type MarketingEmailDecision =
  | Readonly<{ outcome: 'allowed'; lease: MarketingEmailLease }>
  | Readonly<{ outcome: 'allowed_overage'; overage: UsageOverageHold }>
  | Readonly<{ outcome: 'allowed_unmetered'; reason: MarketingEmailAdmission }>
  | Readonly<{ outcome: 'refused' }>;

export type MarketingEmailInput = Readonly<{
  accountId: string;
  /**
   * Stable identity for this recipient of this campaign. A retried campaign send
   * must produce the same key, or it buys a second credit for the same email.
   */
  sendKey: string;
}>;

function insufficientCredits(error: { code?: string; message?: string } | null): boolean {
  return error?.code === 'P0001' && /insufficient usage credits/i.test(error.message ?? '');
}

export async function beginMarketingEmailUsage(
  admin: SupabaseClient,
  input: MarketingEmailInput,
  options: Readonly<{ mode?: MarketingEmailMode; now?: () => Date }> = {},
): Promise<MarketingEmailDecision> {
  const mode = options.mode ?? marketingEmailMode();
  if (mode === 'off') {
    return Object.freeze({ outcome: 'allowed_unmetered' as const, reason: 'not_metered' as const });
  }

  const idempotencyKey = `marketing-email:v1:${input.sendKey}`;
  const finalizationKey = `${idempotencyKey}:commit`;
  const now = (options.now ?? (() => new Date()))();

  let reservationId: unknown = null;
  let reserveError: { code?: string; message?: string } | null = null;
  try {
    const result = await admin.rpc('reserve_usage_credits', {
      p_account_id: input.accountId,
      p_resource_code: MARKETING_EMAIL_RESOURCE_CODE,
      p_units: 1,
      p_idempotency_key: idempotencyKey,
      p_operation_type: MARKETING_EMAIL_OPERATION_TYPE,
      p_expires_at: new Date(now.getTime() + RESERVATION_TTL_MS).toISOString(),
      p_metadata: { schema: 'marketing-email.v1', claim_nonce: randomUUID().toLowerCase() },
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
      if (mode !== 'enforce') {
        return Object.freeze({
          outcome: 'allowed_unmetered' as const, reason: 'exhausted_not_enforced' as const,
        });
      }

      // Out of allowance and about to be refused. Overage can only turn that
      // around, never the other way, and only when the workspace asked for it
      // and set a cap -- see usage-overage.ts.
      const overage = await tryUsageOverage(admin, {
        accountId: input.accountId,
        resourceCode: MARKETING_EMAIL_RESOURCE_CODE,
        units: 1,
        // The reservation key, suffixed. A retry of the same send therefore
        // replays the same charge instead of adding a second one.
        idempotencyKey: `${idempotencyKey}:overage`,
      });
      if (overage.outcome === 'accrued') {
        return Object.freeze({
          outcome: 'allowed_overage' as const,
          overage: Object.freeze({
            resourceCode: MARKETING_EMAIL_RESOURCE_CODE,
            units: 1,
            millicents: overage.chargedMillicents,
            periodStart: overage.periodStart,
            idempotencyKey: overage.idempotencyKey,
          }),
        });
      }
      return Object.freeze({ outcome: 'refused' as const });
    }
    console.error('marketing email reservation failed:', reserveError);
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

/** Spend the held credit. Call only once the provider has accepted the email. */
export async function commitMarketingEmailUsage(
  admin: SupabaseClient,
  lease: MarketingEmailLease,
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
 * Give the held credit back.
 *
 * Never throws: this runs inside a per-recipient catch that must go on to the
 * next recipient, and the expiry sweeper releases anything missed within the
 * reservation's 15 minutes.
 */
export async function releaseMarketingEmailUsage(
  admin: SupabaseClient,
  lease: MarketingEmailLease,
  reason: string,
): Promise<boolean> {
  if (!lease.ownsReservation) return false;
  try {
    const { data, error } = await admin.rpc('release_usage_reservation', {
      p_reservation_id: lease.reservationId,
      p_finalization_key: lease.finalizationKey,
      p_reason: reason.slice(0, 500),
    });
    if (error) console.error('marketing email release failed:', error);
    return !error && data === true;
  } catch (error) {
    console.error('marketing email release threw:', error);
    return false;
  }
}
