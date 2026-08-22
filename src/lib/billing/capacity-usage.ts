import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { PlanUsageLimits } from '@/lib/billing/plan-usage';
import type { PurchasedSeats } from '@/lib/billing/seat-limits';
import type { WorkspaceStorageState } from '@/lib/billing/storage-usage';

/**
 * What a workspace is USING against what it is entitled to.
 *
 * The entitlement half has always been on the Plan & usage tab; the occupancy
 * half has not, so a contractor could read "Office users: 2" and still have no
 * idea whether they could invite anybody. This joins the two.
 *
 * THE LADDER FALLS TO `unknown`, NEVER TO `healthy`. Every count here comes from
 * a read that can fail, and each of these rows sits beside a number about
 * somebody's plan. A grid whose failure mode is a row of green ticks tells a
 * contractor at their limit that they have room, which is the one wrong answer
 * that costs them something. So an unreadable count is its own state, and says so.
 */

export type CapacityVerdict = 'unknown' | 'healthy' | 'near' | 'at_limit' | 'over';

export type CapacityRow = Readonly<{
  key: 'office_users' | 'crew_users' | 'custom_domains' | 'storage';
  label: string;
  /** Null when the count could not be read. Never coerced to zero. */
  used: number | null;
  /** Null when no limit is known -- not the same as a limit of zero. */
  limit: number | null;
  verdict: CapacityVerdict;
  /** The rendered figure, e.g. "1 of 2 used" or "244 KB of 5 GB". */
  detail: string;
  /** The word beside the tone. Color alone is not a status. */
  status: string;
  /** 0-100, or null when there is nothing honest to draw. */
  percent: number | null;
}>;

export type WorkspaceCapacity = Readonly<{ rows: readonly CapacityRow[] }>;

/**
 * Occupancy counts that do not come from the entitlement row.
 *
 * Each is independently nullable because each is an independent read. Bundling
 * them into one "capacity unavailable" would hide three working numbers behind
 * one broken one -- the same reason plan-usage settles its two reads separately.
 */
export type CapacityCounts = Readonly<{
  officeSeatsUsed: number | null;
  crewSeatsUsed: number | null;
  customDomainsUsed: number | null;
}>;

/**
 * Active crew occupying a seat.
 *
 * The predicate is copied EXACTLY from the enforcement gate in 20260816044858:
 * active, not soft-deleted, and worker_type employee. Counting subcontractors
 * would show a contractor "8 of 2 - over plan limit" and press them to buy seats
 * the database would never have charged them for; counting soft-deleted rows
 * would do the same, more quietly. If the gate's predicate moves, this moves.
 *
 * Read through the OWNER'S session client: crew_owner already scopes it, and an
 * admin client here would remove that check rather than satisfy it.
 */
export async function loadCrewSeatsUsed(
  supabase: SupabaseClient,
  accountId: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from('crew')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('active', true)
    .is('deleted_at', null)
    .eq('worker_type', 'employee');

  // A zero-row read and a refused read are not the same fact, and a refusal
  // arrives as an error rather than as 0. Returning 0 here would draw an empty
  // meter over a read that never happened.
  if (error) return null;
  return typeof count === 'number' && Number.isFinite(count) && count >= 0 ? count : null;
}

function verdictFor(used: number | null, limit: number | null): CapacityVerdict {
  if (used === null || limit === null) return 'unknown';
  if (used > limit) return 'over';
  // A limit of zero cannot be divided by, and it is a real entitlement: nothing
  // included. Anything at all under it is already as full as it can get.
  if (limit === 0) return used > 0 ? 'over' : 'at_limit';
  if (used === limit) return 'at_limit';
  return used / limit >= 0.8 ? 'near' : 'healthy';
}

const VERDICT_WORD: Readonly<Record<CapacityVerdict, string>> = {
  unknown: 'Not measured',
  healthy: 'Room to grow',
  near: 'Nearly full',
  at_limit: 'At plan limit',
  over: 'Over plan limit',
};

function percentOf(used: number | null, limit: number | null): number | null {
  if (used === null || limit === null) return null;
  if (limit === 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function seatRow(
  key: 'office_users' | 'crew_users' | 'custom_domains',
  label: string,
  used: number | null,
  included: number | null,
  purchased: number,
): CapacityRow {
  // Plan allowance PLUS anything bought -- the same sum the database gates on,
  // and the same one describeSeatLimit states on the entitlement row.
  const limit = included === null ? null : included + Math.max(0, purchased);
  const verdict = verdictFor(used, limit);
  const detail = used === null
    ? (limit === null ? 'No limit was returned' : `${limit.toLocaleString('en-US')} included`)
    : limit === null
      ? `${used.toLocaleString('en-US')} in use`
      : `${used.toLocaleString('en-US')} of ${limit.toLocaleString('en-US')} used`;
  return { key, label, used, limit, verdict, detail, status: VERDICT_WORD[verdict], percent: percentOf(used, limit) };
}

/**
 * Storage is the one row measured in bytes, and the one that already had a
 * meter. It keeps its own formatting so the figure stays "244 KB of 5 GB"
 * rather than a count of somethings.
 */
function storageRow(
  storage: WorkspaceStorageState | null,
  formatBytes: (bytes: number) => string,
): CapacityRow | null {
  if (!storage) return null;
  const { bytesUsed, limitBytes } = storage;
  const verdict = verdictFor(bytesUsed, limitBytes);
  const detail = bytesUsed === null
    ? (limitBytes === null ? 'Not measured yet' : `${formatBytes(limitBytes)} included, not measured yet`)
    : limitBytes === null
      ? `${formatBytes(bytesUsed)} stored`
      : `${formatBytes(bytesUsed)} of ${formatBytes(limitBytes)}`;
  return {
    key: 'storage',
    label: 'Files & photos',
    used: bytesUsed,
    limit: limitBytes,
    verdict,
    detail,
    status: VERDICT_WORD[verdict],
    percent: percentOf(bytesUsed, limitBytes),
  };
}

/**
 * DEDICATED BUSINESS NUMBERS AND AI VOICE ARE DELIBERATELY ABSENT.
 *
 * Every plan grants zero dedicated numbers -- 20260820150000 took the last one
 * away, because nothing in the product can provision one -- and all three AI
 * Voice SKUs are withheld with no live Price. A capacity meter is a gauge of
 * what a workspace can consume, so a row reading "0 of 5 business numbers" on a
 * $329 plan advertises five phone numbers no plan grants. Those belong in the
 * plan comparison as "coming soon", which is where the product already says it.
 */
export function buildWorkspaceCapacity(
  limits: PlanUsageLimits | null,
  purchased: PurchasedSeats,
  counts: CapacityCounts,
  storage: WorkspaceStorageState | null,
  formatBytes: (bytes: number) => string,
): WorkspaceCapacity {
  const domainLimit = limits?.customDomainConnections ?? null;
  const rows: (CapacityRow | null)[] = [
    seatRow('office_users', 'Office users', counts.officeSeatsUsed, limits?.officeUsers ?? null, purchased.officeUsers),
    seatRow('crew_users', 'Crew users', counts.crewSeatsUsed, limits?.crewUsers ?? null, purchased.crewUsers),
    // Omitted entirely rather than drawn as unknown: a workspace whose
    // entitlement states no domain allowance has no row to show, and an
    // "unknown" one would imply the number exists and could not be read.
    domainLimit === null
      ? null
      : seatRow('custom_domains', 'Custom domains', counts.customDomainsUsed, domainLimit, 0),
    storageRow(storage, formatBytes),
  ];
  return { rows: rows.filter((row): row is CapacityRow => row !== null) };
}
