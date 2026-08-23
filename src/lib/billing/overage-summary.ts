import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { OVERAGE_RATE_MILLICENTS, formatOverage } from '@/lib/billing/usage-overage';

/**
 * What a workspace has run up past its allowance this period.
 *
 * WHY THIS DID NOT EXIST UNTIL NOW, and why that mattered. The accrual table has
 * been written since 20260819080000 and read by nothing: a contractor could
 * incur charges they had authorized and had no way to see them. Of the two
 * halves of an overage — charging it, and showing it — the second is the one you
 * want first, because a number nobody can see is a number nobody can dispute
 * before it lands on a card.
 *
 * READ THROUGH THE OWNER'S SESSION. Every table here carries an owner-read RLS
 * policy and is service-role-writable, deliberately: an owner who could write
 * their own settings row could raise their own cap without leaving evidence.
 * Passing the session client keeps RLS as the second check behind
 * `requireOwnerContext`, and nothing here needs more reach than that.
 */

export type OverageLine = Readonly<{
  resourceCode: string;
  units: number;
  millicents: number;
  /** What one unit past the allowance costs, so the arithmetic is checkable. */
  rateMillicents: number | null;
}>;

export type OverageSummary = Readonly<{
  /** Has the workspace authorized overage at all? Default is no. */
  enabled: boolean;
  capCents: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  lines: readonly OverageLine[];
  totalMillicents: number;
  /** Nothing more may accrue this period. The meters are refusing. */
  atCap: boolean;
  /**
   * FALSE ONLY WHEN THE READ ITSELF FAILED.
   *
   * The catch below used to return EMPTY, which is byte-for-byte a healthy
   * workspace that has not switched overage on -- so a refused or thrown read
   * rendered "Not switched on. Nothing is ever charged past your plan without
   * you turning this on", which is a confident claim about somebody's billing
   * made on the basis of nothing. A workspace with no billing period is a
   * different case and stays readable: that is a real, knowable state.
   */
  readable: boolean;
}>;

const EMPTY: OverageSummary = Object.freeze({
  enabled: false,
  capCents: null,
  periodStart: null,
  periodEnd: null,
  lines: [],
  totalMillicents: 0,
  atCap: false,
  readable: true,
});

/** Nothing is known. Distinct from EMPTY, which asserts that nothing accrued. */
const UNREADABLE: OverageSummary = Object.freeze({ ...EMPTY, readable: false });

/** Human labels. Resource codes are a database vocabulary, not a customer one. */
const RESOURCE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  text_segments: 'Text credits',
  marketing_email_sends: 'Marketing emails',
  ai_writing_drafts: 'AI writing drafts',
  ai_intake_threads: 'AI Intake credits',
  voice_minutes: 'AI-connected minutes',
});

export function describeOverageResource(resourceCode: string): string {
  return RESOURCE_LABELS[resourceCode] ?? resourceCode;
}

export async function loadOverageSummary(
  supabase: SupabaseClient,
  accountId: string,
): Promise<OverageSummary> {
  try {
    // The period the accruals are keyed by. Read from the entitlement rather
    // than assumed to be the calendar month, because `tryUsageOverage` resolves
    // it the same way and the two must agree about which period is "now".
    const [settings, entitlement] = await Promise.all([
      supabase.from('workspace_overage_settings')
        .select('enabled, cap_cents')
        .eq('account_id', accountId)
        .maybeSingle(),
      supabase.from('workspace_entitlements')
        .select('period_start, period_end')
        .eq('account_id', accountId)
        .maybeSingle(),
    ]);

    const enabled = Boolean(settings.error ? false : settings.data?.enabled);
    const capCents = settings.error ? null : (settings.data?.cap_cents as number | null) ?? null;
    const periodStart = entitlement.error ? null : (entitlement.data?.period_start as string | null) ?? null;
    const periodEnd = entitlement.error ? null : (entitlement.data?.period_end as string | null) ?? null;

    // No period means nothing is keyed to read. A Flex workspace has no
    // subscription period; `tryUsageOverage` falls back to the calendar month
    // there, and reproducing that fallback in a second place is how the two
    // start disagreeing about which rows belong to now.
    if (!periodStart || !periodEnd) {
      return Object.freeze({ ...EMPTY, enabled, capCents });
    }

    // EVERY BUCKET THAT OVERLAPS THIS PERIOD, matching authorize_usage_overage
    // exactly since 20260819310000. period_start is not stable -- the
    // subscription projector rewrites it from Stripe mid-month -- so an equality
    // here would show a contractor their full cap untouched while the meters
    // were already refusing them at it. The two must answer the same question.
    const { data, error } = await supabase
      .from('workspace_overage_accruals')
      .select('resource_code, units, millicents')
      .eq('account_id', accountId)
      .gt('period_end', periodStart)
      .lt('period_start', periodEnd)
      .order('millicents', { ascending: false });

    if (error) {
      console.error('overage summary read failed:', error);
      return Object.freeze({ ...EMPTY, enabled, capCents, periodStart, periodEnd });
    }

    // Overlapping buckets can hold the same resource twice -- one row per
    // period -- and showing "Text credits" twice in a list of what was spent
    // would read as a duplicate rather than as two halves of one month.
    const byResource = new Map<string, { units: number; millicents: number }>();
    for (const row of data ?? []) {
      const r = row as Record<string, unknown>;
      const resourceCode = String(r.resource_code);
      const running = byResource.get(resourceCode) ?? { units: 0, millicents: 0 };
      byResource.set(resourceCode, {
        units: running.units + Number(r.units ?? 0),
        millicents: running.millicents + Number(r.millicents ?? 0),
      });
    }

    const lines = [...byResource.entries()]
      .map(([resourceCode, totals]) => Object.freeze({
        resourceCode,
        units: totals.units,
        millicents: totals.millicents,
        rateMillicents: OVERAGE_RATE_MILLICENTS[resourceCode] ?? null,
      }))
      // The order() above no longer decides this, because merging changed the
      // totals it sorted on.
      .sort((a, b) => b.millicents - a.millicents || a.resourceCode.localeCompare(b.resourceCode));

    const totalMillicents = lines.reduce((total, line) => total + line.millicents, 0);

    return Object.freeze({
      enabled,
      capCents,
      periodStart,
      periodEnd,
      lines,
      totalMillicents,
      // The cap is in CENTS and the accrual in millicents, which is exactly the
      // sort of unit mismatch that produces a bill a thousand times too big.
      // Converted once, here, where both are in view.
      atCap: capCents !== null && totalMillicents >= capCents * 1000,
      readable: true,
    });
  } catch (error) {
    console.error('overage summary threw:', error);
    return UNREADABLE;
  }
}

/** `$1.44`, from millicents. Delegates so one accrual cannot print two ways. */
export function formatOverageTotal(millicents: number): string {
  return formatOverage(millicents);
}

/**
 * A PER-UNIT rate, for the surface that has to publish it.
 *
 * The authorization text a contractor ticks says they are charged "at the
 * published per-unit rates" — and the rates lived only in OVERAGE_RATE_MILLICENTS
 * and appeared on no page. `rateMillicents` was already computed for every line
 * "so the arithmetic is checkable" and then dropped on the floor by the renderer.
 *
 * Rates are small: 340 millicents is $0.0034, which formatOverage would round to
 * $0.00. So this keeps four decimal places and trims the trailing zeros rather
 * than reusing the total formatter.
 */
export function formatOverageRate(millicents: number): string {
  const dollars = millicents / 100_000;
  const fixed = dollars.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return `$${fixed}`;
}

/**
 * What is left before the meters start refusing.
 *
 * Returns null when no cap applies, which is not the same as "unlimited": with
 * overage disabled nothing accrues at all, and the caller shows that differently.
 */
export function remainingCapMillicents(summary: OverageSummary): number | null {
  if (!summary.enabled || summary.capCents === null) return null;
  return Math.max(0, summary.capCents * 1000 - summary.totalMillicents);
}
