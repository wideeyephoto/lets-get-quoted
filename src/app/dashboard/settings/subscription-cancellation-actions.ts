'use server';

import { revalidatePath } from 'next/cache';

import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import {
  basePlanSubscriptionCancellationEnabled,
  cancelBasePlanSubscriptionAtPeriodEnd,
} from '@/lib/billing/subscription-cancellation';
import { checkRateLimitStrict } from '@/lib/rate-limit';

export type CancelSubscriptionActionState =
  | { ok: true; alreadyScheduled: boolean; currentPeriodEnd: string | null }
  | { ok: false; error: string }
  | null;

/**
 * Cancel the signed-in owner's base plan at the end of the paid period.
 *
 * A server action is a public endpoint, so the flag, the session and the
 * workspace scope are all re-established here rather than trusted from the
 * component that rendered the button.
 */
export async function cancelBasePlanSubscriptionAction(): Promise<CancelSubscriptionActionState> {
  if (!basePlanSubscriptionCancellationEnabled()) {
    return { ok: false, error: 'Cancelling a plan from here is not switched on yet.' };
  }

  const { accountId, userId, userEmail } = await requireOwnerContext();
  const admin = createAdminClient();

  // A cancel is cheap to repeat and irreversible-feeling to the person clicking,
  // so the limit is about hammering Stripe, not about abuse.
  const allowed = await checkRateLimitStrict(admin, `base-plan-cancel:${userId}`, 6, 10 * 60);
  if (!allowed) {
    return { ok: false, error: 'Too many attempts just now. Wait a few minutes and try again.' };
  }

  // billing_subscriptions is granted to service_role only; the query is scoped
  // to this owner's accountId, which requireOwnerContext just established.
  const result = await cancelBasePlanSubscriptionAtPeriodEnd({
    admin,
    accountId,
    actorEmail: userEmail,
  });

  if (result.ok) revalidatePath('/dashboard/settings');
  return result;
}
