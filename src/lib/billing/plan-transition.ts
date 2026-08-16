import {
  BILLING_PLANS,
  type BillingCycle,
  type BillingPlanId,
} from '@/lib/billing/catalog';
import {
  planUpgradeCreditDeltas,
  workspaceEntitlementCatalogSnapshot,
  type PlanCreditGrant,
  type WorkspaceEntitlementCatalogSnapshot,
} from '@/lib/billing/entitlement-catalog';

export type WorkspacePlanSelection = Readonly<{
  planCode: BillingPlanId;
  billingInterval: 'none' | BillingCycle;
}>;

export type PlanTransitionDecision =
  | Readonly<{
      kind: 'no_change';
      current: WorkspacePlanSelection;
      target: WorkspacePlanSelection;
    }>
  | Readonly<{
      kind: 'activate_after_payment';
      current: WorkspacePlanSelection;
      target: WorkspacePlanSelection;
      targetSnapshot: WorkspaceEntitlementCatalogSnapshot;
      creditGrants: readonly PlanCreditGrant[];
      /** Existing paid subscriptions must successfully invoice the proration. */
      paymentMode: 'new_subscription' | 'invoice_proration';
      platformFeeEffective: 'payment_charge_created_after_activation';
    }>
  | Readonly<{
      kind: 'schedule_at_renewal';
      current: WorkspacePlanSelection;
      target: WorkspacePlanSelection;
      targetSnapshot: WorkspaceEntitlementCatalogSnapshot;
      creditGrants: readonly PlanCreditGrant[];
      platformFeeEffective: 'renewal_activation';
    }>;

const PLAN_RANK: Readonly<Record<BillingPlanId, number>> = Object.freeze({
  flex: 0,
  solo: 1,
  growth: 2,
  scale: 3,
});

function validateSelection(selection: WorkspacePlanSelection, label: string): void {
  if (selection.planCode === 'flex' && selection.billingInterval !== 'none') {
    throw new Error(`${label} Flex selection must use billing interval "none".`);
  }
  if (selection.planCode !== 'flex' && selection.billingInterval === 'none') {
    throw new Error(`${label} paid selection requires monthly or annual billing.`);
  }
}

/**
 * Implements the approved lifecycle rule without making a Stripe call:
 * capacity upgrades activate only after successful payment; downgrades and
 * billing-cycle changes wait for renewal. The caller persists the decision and
 * the webhook/event processor performs the actual entitlement transition.
 */
export function decidePlanTransition(
  current: WorkspacePlanSelection,
  target: WorkspacePlanSelection,
): PlanTransitionDecision {
  validateSelection(current, 'Current');
  validateSelection(target, 'Target');

  if (current.planCode === target.planCode && current.billingInterval === target.billingInterval) {
    return Object.freeze({ kind: 'no_change', current, target });
  }

  const targetSnapshot = workspaceEntitlementCatalogSnapshot(target.planCode, target.billingInterval);
  const isCapacityUpgrade = PLAN_RANK[target.planCode] > PLAN_RANK[current.planCode];

  if (isCapacityUpgrade) {
    return Object.freeze({
      kind: 'activate_after_payment',
      current,
      target,
      targetSnapshot,
      creditGrants: planUpgradeCreditDeltas(current.planCode, target.planCode),
      paymentMode: current.planCode === 'flex' ? 'new_subscription' : 'invoice_proration',
      platformFeeEffective: 'payment_charge_created_after_activation',
    });
  }

  return Object.freeze({
    kind: 'schedule_at_renewal',
    current,
    target,
    targetSnapshot,
    creditGrants: Object.freeze([]),
    platformFeeEffective: 'renewal_activation',
  });
}

export function isSelfServicePaidPlan(planCode: BillingPlanId): boolean {
  return BILLING_PLANS[planCode].monthlyPriceCents > 0;
}
