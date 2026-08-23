'use server';

import { revalidatePath } from 'next/cache';

import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import { BILLING_PLAN_IDS, type BillingCycle, type BillingPlanId } from '@/lib/billing/catalog';
import { changeBasePlan, clearScheduledPlanChange, type PlanChangeResult } from '@/lib/billing/plan-change';
import { checkRateLimitStrict } from '@/lib/rate-limit';

export type PlanChangeActionState = PlanChangeResult | null;

/**
 * A server action is a public endpoint, so the plan and interval arriving here
 * are re-validated rather than trusted from the form that rendered them, and the
 * session and workspace scope are re-established. The form can be edited; this
 * cannot.
 */
function parseTarget(planCode: unknown, billingInterval: unknown):
  { planCode: BillingPlanId; billingInterval: 'none' | BillingCycle } | null {
  if (typeof planCode !== 'string') return null;
  if (!(BILLING_PLAN_IDS as readonly string[]).includes(planCode)) return null;
  const plan = planCode as BillingPlanId;
  if (plan === 'flex') return { planCode: plan, billingInterval: 'none' };
  if (billingInterval !== 'monthly' && billingInterval !== 'annual') return null;
  return { planCode: plan, billingInterval };
}

export async function changeBasePlanAction(
  planCode: string,
  billingInterval: string,
): Promise<PlanChangeActionState> {
  const target = parseTarget(planCode, billingInterval);
  if (!target) return { ok: false, error: 'That is not a plan we can move you to.' };

  const owner = await requireOwnerContext();
  const { accountId, userId, userEmail } = owner;
  const admin = createAdminClient();

  // An upgrade charges a proration, so the limit is tighter than a read would
  // need and shares its bucket with the scheduled-change actions below: the set
  // is one toggle, and separate buckets would let somebody alternate between
  // them and make several times the Stripe calls the limit allows.
  const allowed = await checkRateLimitStrict(admin, `base-plan-change:${userId}`, 6, 10 * 60);
  if (!allowed) {
    return { ok: false, error: 'Too many attempts just now. Wait a few minutes and try again.' };
  }

  const result = await changeBasePlan({
    admin,
    // The consent recorder runs as the signed-in owner, never the service role:
    // the acceptance records auth.uid() and has to name a human.
    owner: { supabase: owner.supabase, accountId, userId },
    accountId,
    targetPlanCode: target.planCode,
    targetBillingInterval: target.billingInterval,
    actorEmail: userEmail,
  });

  if (result.ok) revalidatePath('/dashboard/settings');
  return result;
}

export async function cancelScheduledPlanChangeAction(): Promise<PlanChangeActionState> {
  const { accountId, userId, userEmail } = await requireOwnerContext();
  const admin = createAdminClient();

  const allowed = await checkRateLimitStrict(admin, `base-plan-change:${userId}`, 6, 10 * 60);
  if (!allowed) {
    return { ok: false, error: 'Too many attempts just now. Wait a few minutes and try again.' };
  }

  const result = await clearScheduledPlanChange({ admin, accountId, actorEmail: userEmail });
  if (result.ok) revalidatePath('/dashboard/settings');
  return result;
}
