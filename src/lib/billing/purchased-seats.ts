import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { NO_PURCHASED_SEATS, type PurchasedSeats } from './seat-limits';

export { NO_PURCHASED_SEATS, describeSeatLimit, type PurchasedSeats } from './seat-limits';

/**
 * Seats a workspace has bought on top of its plan.
 *
 * WHY THIS EXISTS. `crew_user` went on sale on 2026-08-20 at $5 a month, and the
 * database honours it: `create_crew_member_with_seat_entitlement` adds
 * `workspace_purchased_capacity_units` to the plan allowance before it counts,
 * so a purchased seat really does raise the limit. The Account page did not know
 * that. It read `feature_limits.crew_users` off the entitlement snapshot, which
 * is the PLAN allowance and nothing else — so a contractor could pay for a
 * fourth seat, have it work, and still see "Crew users: 2" on the only screen
 * that tells them what they are entitled to.
 *
 * Buying something and being shown no evidence of it is how a $5 charge becomes
 * a support conversation.
 *
 * SERVICE-ROLE, DELIBERATELY, and for the same reason the storage state read on
 * that page is: `workspace_purchased_capacity_units` is revoked from
 * `authenticated` and granted only to `service_role`. Owners are shown the
 * EFFECT of the ledger, never the ledger. The account id comes from the caller's
 * own `requireOwnerContext` and is passed explicitly, so the widened client
 * never widens the scope.
 *
 * ONLY `active` AND `past_due` COUNT, which is the RPC's own rule rather than
 * this module's: a cancelled seat stops being counted, and `past_due` keeps
 * counting on purpose so a failed $5 card does not lock an employee out of a job
 * they are standing on while Stripe is still retrying.
 */


async function unitsFor(
  admin: SupabaseClient,
  accountId: string,
  resourceCode: 'crew_users' | 'office_users',
): Promise<number> {
  const { data, error } = await admin.rpc('workspace_purchased_capacity_units', {
    p_account_id: accountId,
    p_resource_code: resourceCode,
  });

  if (error) {
    console.error(`purchased ${resourceCode} read failed:`, error.message);
    return 0;
  }

  // The RPC returns bigint, which PostgREST renders as a number when small and
  // a string when it is not sure. Neither is worth trusting blindly on a screen
  // that states an entitlement, so anything that is not a clean non-negative
  // integer reads as zero rather than as NaN in front of the word "seats".
  const value = typeof data === 'string' ? Number(data) : data;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

/**
 * Fails to ZERO, never to null, and the difference matters.
 *
 * A null would have to mean "unknown", and the page would then have to choose
 * between hiding the plan limit it does know and showing a total it is not sure
 * about. Zero degrades to exactly the behavior that shipped before this existed:
 * the plan allowance, stated plainly. The seat still works — the database is
 * what enforces it — so the cost of reading low is a line that undersells what
 * somebody has, which is the survivable direction.
 */
export async function loadPurchasedSeats(
  admin: SupabaseClient,
  accountId: string,
): Promise<PurchasedSeats> {
  const [crewUsers, officeUsers] = await Promise.all([
    unitsFor(admin, accountId, 'crew_users'),
    unitsFor(admin, accountId, 'office_users'),
  ]);
  return Object.freeze({ crewUsers, officeUsers });
}

