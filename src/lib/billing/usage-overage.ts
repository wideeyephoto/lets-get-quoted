import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { formatUsdExact } from '@/lib/money-format';

/**
 * Charging a workspace for what it used past its allowance — but only if it
 * asked to be, and only up to a number it chose.
 *
 * The price book's rule is absolute: LGQ never charges an automatic overage
 * without affirmative approval AND a spending cap. Everything here follows from
 * that, and the important consequence is that this module can only ever turn a
 * refusal into an admission — never the other way round. A meter that was going
 * to refuse asks this first; a meter that was going to allow never calls it.
 *
 * The decision and the accrual happen in ONE database statement under one lock
 * (`authorize_usage_overage`), because two concurrent sends that each fit under
 * the cap but together exceed it must not both be admitted. That is not
 * expressible from here, which is why almost nothing in this file is a decision.
 *
 * WHY MILLICENTS. Two rates are fractions of a cent — marketing email is 0.34c
 * a send. Accruing whole cents would round every one of those to zero or to a
 * cent, which across a 5,000-recipient campaign is the difference between $17
 * and $50. Money is only rounded when an invoice is produced, which nothing
 * does yet.
 */

export const USAGE_OVERAGE_FLAG = 'LGQ_USAGE_OVERAGE_ENABLED';

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export function usageOverageEnabled(env: ServerEnvironment = process.env): boolean {
  return env[USAGE_OVERAGE_FLAG] === '1';
}

/**
 * What one unit past the allowance costs, in millicents (1/1000 of a cent).
 *
 * Derived from the top-up price book, deliberately at the SMALLER pack's rate
 * where a resource has two. Text credits sell at 4.8c in the 250 pack and 4.2c
 * in the 1,000 pack; overage is priced at 4.8c so buying a top-up is always at
 * least as cheap as overrunning. Planning ahead should not cost more than not
 * planning ahead — that is the whole argument for these numbers, and it is the
 * one to re-check if the price book moves.
 *
 * `test/usage-overage.test.ts` pins every rate against the catalog, so a top-up
 * price that changes without this changing fails there rather than silently
 * making overage the cheaper option.
 */
export const OVERAGE_RATE_MILLICENTS: Readonly<Record<string, number>> = Object.freeze({
  text_segments: 4_800, // flex_text_250: $12.00 / 250
  marketing_email_sends: 340, // marketing_email_5000: $17.00 / 5000
  ai_writing_drafts: 7_600, // ai_writing_250: $19.00 / 250
  ai_intake_threads: 15_000, // ai_intake_100: $15.00 / 100
  // voice_minutes_100: $35.00 / 100. The only rate here that EQUALS its pack
  // rather than undercutting it -- the others take the smaller pack's price so a
  // top-up is always cheaper than overrunning, and equal satisfies that same
  // invariant. Against $0.1666 of provider cost, both sides are 52% margin.
  voice_minutes: 35_000,
});

/**
 * The same shape workspace_overage_accrual_events enforces. Kept beside the
 * rates rather than inside the call so the meters can be checked against it.
 */
export const OVERAGE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.@|-]{7,199}$/;

export type UsageOverageDecision =
  | Readonly<{
    outcome: 'accrued';
    chargedMillicents: number;
    accruedMillicents: number;
    capMillicents: number;
    /**
     * The period the accrual was written under, carried so the release can
     * target the same row. Re-deriving it was a real bug: `resolvePeriod` reads
     * nullable entitlement columns and falls back to the calendar month, so a
     * release moments after midnight -- or after an entitlement period lands on
     * a Flex workspace -- looked up a period that had no accrual, released
     * nothing, and reported success.
     */
    periodStart: string;
    /** The key it was accrued under, so the release can name the same charge. */
    idempotencyKey: string;
  }>
  | Readonly<{ outcome: 'not_authorized' }>
  | Readonly<{ outcome: 'cap_reached'; accruedMillicents: number; capMillicents: number }>
  | Readonly<{ outcome: 'unavailable' }>;

/**
 * A charge that was accrued and can be given back.
 *
 * Exported from here, where the release lives, because four meters and three
 * call sites all held their own copy of this shape and none of them carried the
 * period -- which is exactly how the release ended up looking one up.
 */
export type UsageOverageHold = Readonly<{
  resourceCode: string;
  units: number;
  millicents: number;
  periodStart: string;
  /**
   * What was charged, named. The release quotes this back rather than
   * re-describing the charge in its own words -- see releaseUsageOverage.
   */
  idempotencyKey: string;
}>;

export type UsageOverageInput = Readonly<{
  accountId: string;
  resourceCode: string;
  /** Units the caller could not cover from the allowance. */
  units: number;
  /**
   * WHICH overrun this is. Required, and stable across retries of the same
   * work: every meter already computes one for its reservation, and the overage
   * path is the only place that used to throw it away. Without it the same send
   * charged twice whenever this call was repeated -- and it is repeated
   * whenever the RPC commits and the answer does not come back.
   */
  idempotencyKey: string;
}>;

/**
 * The period a cap applies to.
 *
 * A paid workspace has one on its entitlement. A Flex workspace does not, so it
 * falls back to the calendar month — which is the same shape and, since Flex has
 * no subscription to overrun against, is only ever a bookkeeping boundary.
 */
async function resolvePeriod(
  admin: SupabaseClient,
  accountId: string,
): Promise<{ start: string; end: string } | null> {
  try {
    const { data, error } = await admin
      .from('workspace_entitlements')
      .select('period_start, period_end')
      .eq('account_id', accountId)
      .maybeSingle();
    if (error) return null;

    const start = data?.period_start as string | null | undefined;
    const end = data?.period_end as string | null | undefined;
    if (start && end) return { start, end };

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { start: monthStart.toISOString(), end: monthEnd.toISOString() };
  } catch {
    return null;
  }
}

/**
 * Ask whether this overrun may be charged, and record it if so.
 *
 * Returns `unavailable` for anything it could not determine — an unknown
 * resource, an unreadable period, a database error. Callers treat that exactly
 * as `not_authorized`: the promise is that nothing is charged without approval,
 * so uncertainty has to fall on the side of not charging.
 */
export async function tryUsageOverage(
  admin: SupabaseClient,
  input: UsageOverageInput,
  options: Readonly<{ enabled?: boolean }> = {},
): Promise<UsageOverageDecision> {
  if (!(options.enabled ?? usageOverageEnabled())) {
    return Object.freeze({ outcome: 'not_authorized' as const });
  }

  const rate = OVERAGE_RATE_MILLICENTS[input.resourceCode];
  if (!rate || input.units <= 0) return Object.freeze({ outcome: 'unavailable' as const });
  // The database refuses a malformed key outright. Catching it here keeps a
  // caller mistake from reading as a provider failure in the logs.
  if (!OVERAGE_KEY_PATTERN.test(input.idempotencyKey)) {
    console.error('usage overage called without a usable idempotency key:', input.resourceCode);
    return Object.freeze({ outcome: 'unavailable' as const });
  }

  const period = await resolvePeriod(admin, input.accountId);
  if (!period) return Object.freeze({ outcome: 'unavailable' as const });

  try {
    const { data, error } = await admin.rpc('authorize_usage_overage', {
      p_account_id: input.accountId,
      p_resource_code: input.resourceCode,
      p_units: input.units,
      p_rate_millicents: rate,
      p_period_start: period.start,
      p_period_end: period.end,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) {
      console.error('usage overage authorization failed:', error);
      return Object.freeze({ outcome: 'unavailable' as const });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const decision = row?.decision;
    const accrued = Number(row?.accrued_millicents ?? 0);
    const cap = Number(row?.cap_millicents ?? 0);
    const charged = Number(row?.charged_millicents ?? 0);

    if (decision === 'accrued') {
      return Object.freeze({
        outcome: 'accrued' as const,
        chargedMillicents: charged,
        accruedMillicents: accrued,
        capMillicents: cap,
        periodStart: period.start,
        idempotencyKey: input.idempotencyKey,
      });
    }
    if (decision === 'cap_reached') {
      return Object.freeze({
        outcome: 'cap_reached' as const, accruedMillicents: accrued, capMillicents: cap,
      });
    }
    if (decision === 'not_authorized') return Object.freeze({ outcome: 'not_authorized' as const });
    return Object.freeze({ outcome: 'unavailable' as const });
  } catch (error) {
    console.error('usage overage authorization threw:', error);
    return Object.freeze({ outcome: 'unavailable' as const });
  }
}

/**
 * Give back an overage authorized for work that then failed.
 *
 * The cap check and the accrual must happen together, BEFORE the work, or two
 * concurrent charges could each pass a cap they jointly exceed. So an overage
 * is charged a moment before anyone knows the send succeeded, and this is the
 * way back -- exactly as releaseTextCreditUsage is the way back from a
 * reservation.
 *
 * IT NAMES THE CHARGE RATHER THAN DESCRIBING IT. The old signature passed
 * resource, period, units and millicents, and the database subtracted whatever
 * it was told and floored at zero. Flooring stops one release going negative;
 * it does not stop the same release being applied twice once other charges have
 * refilled the row, and it cannot tell a release of the wrong amount from a
 * release of the right one. The amount now comes from the recorded event, and
 * an event releases exactly once.
 *
 * Never throws: it runs in a caller's error path.
 */
export async function releaseUsageOverage(
  admin: SupabaseClient,
  input: Readonly<{
    accountId: string;
    /** The key the charge was accrued under. Never re-derived here. */
    idempotencyKey: string;
    /** Carried for the log line only; the database uses its own record. */
    resourceCode?: string;
    millicents?: number;
  }>,
): Promise<boolean> {
  if (!input.idempotencyKey) return false;
  try {
    const { data, error } = await admin.rpc('release_usage_overage', {
      p_account_id: input.accountId,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) {
      // A settled period refuses rather than rewriting the inputs to a charge
      // that has already been decided. The customer is owed this money back and
      // no code path can give it to them, so it is said as plainly as possible.
      if (/already been settled/.test(String(error.message ?? ''))) {
        console.error(
          'usage overage OWED BACK but period already settled -- needs a manual credit:',
          input.accountId, input.idempotencyKey,
        );
        return false;
      }
      console.error('usage overage release failed:', error);
      return false;
    }

    // The RPC returns the millicents it actually gave back. `!error` was the
    // old answer and it was wrong: a release that matched no row returns 0
    // perfectly happily, so a failed send kept its charge and reported success.
    const released = Number(data ?? 0);
    if (!Number.isFinite(released)) return false;
    if (released <= 0) {
      // Zero means the key matched no open event: either it was never accrued,
      // or it was already released. Both leave a failed send holding its
      // charge, so neither may report success.
      console.error(
        'usage overage release found nothing to release:',
        input.resourceCode ?? 'unknown', input.idempotencyKey,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error('usage overage release threw:', error);
    return false;
  }
}

/**
 * Settle an overage for fewer units than were held.
 *
 * The mirror of `commitUsageReservationPartial` for the path that has no
 * reservation. A phone call is charged the full 60-minute safety cap the moment
 * it is admitted on overage, because nobody can know its length in advance --
 * so without this a twenty-second wrong number costs the whole cap, $21, and
 * nothing gives it back.
 *
 * Returns the millicents given back. ZERO IS A REAL ANSWER: a call that ran the
 * full cap owes the entire hold. Distinguish "gave nothing back" from "found
 * nothing to settle" by the `settled` flag, not by the number.
 *
 * Never throws: like the release, it runs where a failure must not take the
 * caller down with it.
 */
export async function settleUsageOverage(
  admin: SupabaseClient,
  input: Readonly<{ accountId: string; idempotencyKey: string; units: number }>,
): Promise<{ settled: boolean; refundedMillicents: number }> {
  const nothing = { settled: false, refundedMillicents: 0 };
  if (!input.idempotencyKey || !Number.isSafeInteger(input.units) || input.units < 0) {
    return nothing;
  }
  try {
    const { data, error } = await admin.rpc('settle_usage_overage', {
      p_account_id: input.accountId,
      p_idempotency_key: input.idempotencyKey,
      p_units: input.units,
    });
    if (error) {
      // A period that has already been settled refuses rather than rewriting a
      // charge that is decided. Said plainly, because nothing here can fix it.
      if (/already been settled/.test(String(error.message ?? ''))) {
        console.error(
          'voice overage OWED BACK but period already settled -- needs a manual credit:',
          input.accountId, input.idempotencyKey,
        );
        return nothing;
      }
      console.error('usage overage settlement failed:', error);
      return nothing;
    }
    const refunded = Number(data ?? 0);
    if (!Number.isFinite(refunded)) return nothing;
    return { settled: true, refundedMillicents: refunded };
  } catch (error) {
    console.error('usage overage settlement threw:', error);
    return nothing;
  }
}

/**
 * Millicents as the money a person would read.
 *
 * The dollars-to-string half is `formatUsdExact` rather than a second
 * `.toFixed(2)` here. That function exists because this codebase once carried
 * two implementations and showed a homeowner one number in an itemised list and
 * a differently rounded one in the summary; an accrual printed one way on a
 * settings page and another on an invoice would be the same bug about money a
 * contractor is actually charged. This function owns exactly one thing the
 * shared helper cannot know: that its input is thousandths of a cent.
 *
 * Rounding to the nearest cent is deliberate and lossy. A single marketing email
 * at 340 millicents reads as $0.00, which is honest — a third of a cent is not a
 * price anyone is charged. What gets charged is the accrued total, and that is
 * what this is called on.
 */
export function formatOverage(millicents: number): string {
  return formatUsdExact(Math.round(millicents / 1000) / 100);
}
