import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { PLAN_USAGE_RESOURCES, type PlanUsageResourceCode } from '@/lib/billing/plan-usage';

/**
 * Credit balances split into the two things they actually are.
 *
 * WHY THIS IS NOT IN plan-usage.ts. That module reads two owner-safe
 * projections and is fenced to exactly that by test/plan-usage-surface --
 * no admin client, two account filters, and explicitly no usage_credit_lots.
 * The fence is worth keeping, so this is a sibling rather than a widening.
 *
 * WHY THE VIEW COULD NOT ANSWER THIS. workspace_usage_credit_balances groups by
 * (account_id, resource_code) and nothing else, so its granted_units is every
 * lot ever granted to the account, for all time. A meter drawn against it climbs
 * toward full with account age and reads "83% used" on the morning an allowance
 * resets. The denominator has to be the grant for the window you are IN, which
 * means reading the lots.
 *
 * WHY THE SPLIT IS BY EXPIRY AND NOT BY source_type. source_type is the column
 * that actually says 'plan_period' or 'purchase', and it is NOT granted to
 * `authenticated` -- the column-level grant stops at available_from and
 * expires_at. Expiry is what IS granted, and a CHECK constraint
 * (usage_credit_lots_purchases_do_not_expire) guarantees a purchase never
 * expires, so "does not expire" is sound.
 *
 * It is not equivalent, though, and the copy must not pretend it is: the free
 * flex_starter grant does not expire either. So the non-expiring bucket is
 * labelled "Non-expiring", never "Purchased" -- a Flex owner has bought nothing
 * and must not be told they did.
 */

export type CreditLotSplit = Readonly<{
  resourceCode: PlanUsageResourceCode;
  label: string;
  /** Credits in an open, expiring lot -- this period's allowance. */
  periodRemaining: number | null;
  /** What that allowance started at. The only honest meter denominator. */
  periodGranted: number | null;
  /** Consumed out of the open window. Not derived from the two above: a lot can be revoked. */
  periodUsed: number | null;
  /** Credits that never expire: purchases, and the free starter grant. */
  nonExpiring: number;
  /** 0-100 of the period allowance consumed, or null when there is no window to measure. */
  percentUsed: number | null;
  nextExpirationAt: string | null;
}>;

export type WorkspaceCreditLots =
  | { kind: 'ready'; resources: readonly CreditLotSplit[] }
  | { kind: 'unavailable' };

type LotRow = {
  account_id: unknown;
  resource_code: unknown;
  granted_units: unknown;
  consumed_units: unknown;
  reserved_units: unknown;
  revoked_units: unknown;
  available_from: unknown;
  expires_at: unknown;
};

/** bigint arrives as a number when it fits and a string when it does not. */
function safeNonNegativeInteger(value: unknown): number | null {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** undefined means "present but unusable", which collapses the whole read. */
function optionalInstant(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : undefined;
}

export function normalizeCreditLots(
  rows: LotRow[] | null,
  accountId: string,
  now: number,
): WorkspaceCreditLots {
  if (!rows) return { kind: 'unavailable' };

  type Bucket = {
    periodRemaining: number;
    periodGranted: number;
    periodUsed: number;
    nonExpiring: number;
    sawPeriodLot: boolean;
    nextExpirationAt: number | null;
  };
  const byResource = new Map<PlanUsageResourceCode, Bucket>();
  const bucket = (code: PlanUsageResourceCode): Bucket => {
    const found = byResource.get(code);
    if (found) return found;
    const created: Bucket = {
      periodRemaining: 0, periodGranted: 0, periodUsed: 0,
      nonExpiring: 0, sawPeriodLot: false, nextExpirationAt: null,
    };
    byResource.set(code, created);
    return created;
  };

  for (const row of rows) {
    // Defense in depth behind RLS, and the same shape plan-usage uses: a row
    // for somebody else is not a row to skip, it is a read to distrust.
    if (row.account_id !== accountId) return { kind: 'unavailable' };

    const resource = PLAN_USAGE_RESOURCES.find((candidate) => candidate.code === row.resource_code);
    // Other ledgers share this table -- voice minutes, storage. They are not
    // part of this surface and are deliberately ignored, not distrusted.
    if (!resource) continue;

    const granted = safeNonNegativeInteger(row.granted_units);
    const consumed = safeNonNegativeInteger(row.consumed_units);
    const reserved = safeNonNegativeInteger(row.reserved_units);
    const revoked = safeNonNegativeInteger(row.revoked_units);
    const availableFrom = optionalInstant(row.available_from);
    const expiresAt = optionalInstant(row.expires_at);
    if (
      granted === null || consumed === null || reserved === null || revoked === null
      || availableFrom === undefined || expiresAt === undefined
    ) {
      return { kind: 'unavailable' };
    }

    // Not yet available is not yet anything. Counting it would show credits a
    // contractor cannot spend today.
    if (availableFrom !== null && availableFrom > now) continue;

    const remaining = Math.max(0, granted - consumed - reserved - revoked);
    const target = bucket(resource.code);

    if (expiresAt === null) {
      target.nonExpiring += remaining;
      continue;
    }
    // Expired, and nothing to say about it here -- the balance view reports
    // expired_unused_units separately and this surface does not show it.
    if (expiresAt <= now) continue;

    target.sawPeriodLot = true;
    target.periodGranted += granted;
    target.periodRemaining += remaining;
    target.periodUsed += consumed;
    target.nextExpirationAt = target.nextExpirationAt === null
      ? expiresAt
      : Math.min(target.nextExpirationAt, expiresAt);
  }

  return {
    kind: 'ready',
    resources: PLAN_USAGE_RESOURCES.map((resource) => {
      const found = byResource.get(resource.code);
      const sawPeriod = found?.sawPeriodLot ?? false;
      const periodGranted = sawPeriod ? found!.periodGranted : null;
      return {
        resourceCode: resource.code,
        label: resource.label,
        // Null, not zero: a workspace with no open window has no period
        // allowance to report, which is exactly Flex's situation and not a
        // shortage.
        periodRemaining: sawPeriod ? found!.periodRemaining : null,
        periodGranted,
        periodUsed: sawPeriod ? found!.periodUsed : null,
        nonExpiring: found?.nonExpiring ?? 0,
        percentUsed: periodGranted && periodGranted > 0
          ? Math.min(100, Math.round((found!.periodUsed / periodGranted) * 100))
          : null,
        nextExpirationAt: found?.nextExpirationAt === null || found?.nextExpirationAt === undefined
          ? null
          : new Date(found.nextExpirationAt).toISOString(),
      };
    }),
  };
}

/**
 * Read through the OWNER'S session client. usage_credit_lots_owner_read is the
 * authorization boundary; the account filter is defense in depth and keeps the
 * contract visible at the call site.
 *
 * Every column named here is in the column-level grant to `authenticated`
 * (20260815213142). Adding source_type to this select would fail as a
 * permission error, not silently return null -- which is the right failure, but
 * is why the split above is by expiry.
 */
export async function loadWorkspaceCreditLots(
  supabase: SupabaseClient,
  accountId: string,
  now: number = Date.now(),
): Promise<WorkspaceCreditLots> {
  const { data, error } = await supabase
    .from('usage_credit_lots')
    .select('account_id, resource_code, granted_units, consumed_units, reserved_units, revoked_units, available_from, expires_at')
    .eq('account_id', accountId);

  if (error) return { kind: 'unavailable' };
  return normalizeCreditLots((data as LotRow[] | null) ?? null, accountId, now);
}
