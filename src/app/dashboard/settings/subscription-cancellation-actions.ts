'use server';

import { revalidatePath } from 'next/cache';

import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import {
  CANCELLATION_DISABLED_MESSAGE,
  basePlanSubscriptionCancellationEnabled,
  cancelBasePlanSubscriptionAtPeriodEnd,
  resumeBasePlanSubscription,
} from '@/lib/billing/subscription-cancellation';
import { checkRateLimitStrict } from '@/lib/rate-limit';

export type CancelSubscriptionActionState =
  | { ok: true; alreadyScheduled: boolean; currentPeriodEnd: string | null }
  | { ok: false; error: string }
  | null;

export type ResumeSubscriptionActionState =
  | { ok: true; alreadyActive: boolean; currentPeriodEnd: string | null }
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
    return { ok: false, error: CANCELLATION_DISABLED_MESSAGE };
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

/**
 * Undo a scheduled cancellation for the signed-in owner.
 *
 * Same shape as the cancel action above and for the same reason: a server action
 * is a public endpoint, so the flag, the session and the workspace scope are
 * re-established here rather than trusted from the component.
 *
 * The rate limit is deliberately the SAME bucket as the cancel action rather
 * than one of its own. The pair is a toggle, and each flip is a Stripe write; a
 * separate bucket would let somebody alternate cancel/resume and make twice the
 * API calls the limit was written to allow.
 */
export async function resumeBasePlanSubscriptionAction(): Promise<ResumeSubscriptionActionState> {
  if (!basePlanSubscriptionCancellationEnabled()) {
    return { ok: false, error: 'Changing a plan from here is not switched on yet.' };
  }

  const { accountId, userId, userEmail } = await requireOwnerContext();
  const admin = createAdminClient();

  const allowed = await checkRateLimitStrict(admin, `base-plan-cancel:${userId}`, 6, 10 * 60);
  if (!allowed) {
    return { ok: false, error: 'Too many attempts just now. Wait a few minutes and try again.' };
  }

  const result = await resumeBasePlanSubscription({ admin, accountId, actorEmail: userEmail });

  if (result.ok) revalidatePath('/dashboard/settings');
  return result;
}

/**
 * Cancel a recurring purchased capacity add-on (e.g. extra crew seat) for the signed-in owner.
 */
export async function cancelPurchasedCapacitySubscriptionAction(
  stripeSubscriptionId: string,
): Promise<CancelSubscriptionActionState> {
  const cleanId = String(stripeSubscriptionId ?? '').trim();
  if (!cleanId || !cleanId.startsWith('sub_')) {
    return { ok: false, error: 'A valid subscription ID is required.' };
  }

  const { accountId, userId, userEmail } = await requireOwnerContext();
  const admin = createAdminClient();

  const allowed = await checkRateLimitStrict(admin, `capacity-cancel:${userId}`, 6, 10 * 60);
  if (!allowed) {
    return { ok: false, error: 'Too many attempts just now. Wait a few minutes and try again.' };
  }

  const { cancelPurchasedCapacitySubscriptionAtPeriodEnd } = await import('@/lib/billing/subscription-cancellation');
  const result = await cancelPurchasedCapacitySubscriptionAtPeriodEnd({
    admin,
    accountId,
    stripeSubscriptionId: cleanId,
    actorEmail: userEmail,
  });

  if (result.ok) revalidatePath('/dashboard/settings');
  return result;
}
