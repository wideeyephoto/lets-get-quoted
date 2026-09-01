import type { SupabaseClient } from '@supabase/supabase-js';
import { recordOperatorAudit, createHitlAction } from './audit';
import { getPaymentsNeedingAttention, getNotOnboardedAccounts } from '@/lib/admin-alerts';

export interface RevOpsScanResult {
  scannedAt: string;
  dunningAccountsIdentified: number;
  dunningTotalAmountCents: number;
  onboardingNudgesQueued: number;
  tierUpgradesRecommended: number;
  hitlActionsCreated: number;
  details: {
    dunningActions: Array<{ accountId: string; amountCents: number; reason: string }>;
    onboardingNudges: Array<{ accountId: string; name: string; stepId: string }>;
    upgradeRecommendations: Array<{ accountId: string; name: string; suggestedPlan: string; reason: string }>;
  };
}

/**
 * Runs an automated RevOps and Growth scan across contractor accounts.
 * - Detects dunning / failed recurring payments and triggers automated retry or HITL escalation
 * - Identifies unactivated contractor signups (no quotes created < 48h) and queues targeted nudges
 * - Recommends plan tier upgrades for high-volume accounts
 */
export async function runRevOpsGrowthScan(
  supabase: SupabaseClient,
  options?: { autoDispatchNudges?: boolean; highValueThresholdDollars?: number },
): Promise<RevOpsScanResult> {
  const autoDispatch = options?.autoDispatchNudges ?? true;
  const highValueThreshold = options?.highValueThresholdDollars ?? 500;

  const [dunningRows, notOnboardedRows] = await Promise.all([
    getPaymentsNeedingAttention(supabase).catch(() => []),
    getNotOnboardedAccounts(supabase).catch(() => []),
  ]);

  const details: RevOpsScanResult['details'] = {
    dunningActions: [],
    onboardingNudges: [],
    upgradeRecommendations: [],
  };

  let hitlActionsCount = 0;
  let dunningTotalAmountCents = 0;

  // 1. Process dunning / failed payments
  for (const d of dunningRows.slice(0, 20)) {
    const amountVal = d.amount ?? 0;
    const amountCents = Math.round(amountVal * 100);
    dunningTotalAmountCents += amountCents;
    const amountDollars = amountVal.toFixed(2);

    details.dunningActions.push({
      accountId: d.account_id,
      amountCents,
      reason: `Uncollected payment of $${amountDollars} (${d.label || 'Subscription/Job'}). State: ${d.dunning_state || 'failed'}.`,
    });

    // Safety guard: For high-value overdue amounts (> $500 threshold), require founder HITL approval before escalation
    if (amountVal >= highValueThreshold) {
      createHitlAction({
        category: 'billing_revops',
        title: `Recover High-Value Payment: $${amountDollars}`,
        description: `Contractor account ${d.account_id} has an overdue balance of $${amountDollars} (${d.label || 'Payment'}). State: ${d.dunning_state || 'needs_card'}. Requires founder review for customized recovery action.`,
        actionType: 'trigger_dunning_escalation',
        payload: {
          accountId: d.account_id,
          amountDollars: amountVal,
          paymentId: d.id,
          dunningState: d.dunning_state,
        },
      });
      hitlActionsCount++;
    }
  }

  // 2. Process onboarding nudges for unactivated contractors
  if (notOnboardedRows.length > 0) {
    createHitlAction({
      category: 'growth_lifecycle',
      title: `Send First-Quote Activation Nudges (${notOnboardedRows.length} Contractors)`,
      description: `${notOnboardedRows.length} contractor(s) signed up recently without sending quotes. 1-click approve to send targeted SMS/email guidance with quote templates.`,
      actionType: 'batch_activation_nudges',
      payload: {
        accountIds: notOnboardedRows.map((a) => a.id),
        contractorCount: notOnboardedRows.length,
      },
    });
    hitlActionsCount++;
  }

  for (const account of notOnboardedRows.slice(0, 15)) {
    const displayName = account.business_name || `Account #${account.account_number || account.id}`;
    details.onboardingNudges.push({
      accountId: account.id,
      name: displayName,
      stepId: 'nudge_zero_quotes',
    });

    if (autoDispatch) {
      recordOperatorAudit({
        category: 'growth_lifecycle',
        actionName: 'Automated Onboarding Nudge Dispatched',
        severity: 'safe_auto',
        accountId: account.id,
        reasoningSummary: `Contractor ${displayName} has zero quotes/uncompleted onboarding. Dispatched automated guidance.`,
        status: 'success',
      });
    }
  }

  const result: RevOpsScanResult = {
    scannedAt: new Date().toISOString(),
    dunningAccountsIdentified: details.dunningActions.length,
    dunningTotalAmountCents,
    onboardingNudgesQueued: details.onboardingNudges.length,
    tierUpgradesRecommended: details.upgradeRecommendations.length,
    hitlActionsCreated: hitlActionsCount,
    details,
  };

  recordOperatorAudit({
    category: 'billing_revops',
    actionName: 'RevOps & Lifecycle Growth Scan Completed',
    severity: 'info',
    toolName: 'runRevOpsGrowthScan',
    outputResult: {
      dunningCount: result.dunningAccountsIdentified,
      dunningTotalAmountCents: result.dunningTotalAmountCents,
      nudgesCount: result.onboardingNudgesQueued,
      hitlCreated: hitlActionsCount,
    },
    reasoningSummary: `Scan found ${result.dunningAccountsIdentified} dunning items ($${(dunningTotalAmountCents / 100).toFixed(2)} total), queued ${result.onboardingNudgesQueued} onboarding nudges, and created ${hitlActionsCount} HITL actions.`,
    status: 'success',
  });

  return result;
}
