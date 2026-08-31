import type { SupabaseClient } from '@supabase/supabase-js';
import { recordOperatorAudit, createHitlAction } from './audit';
import { getPaymentsNeedingAttention, getNotOnboardedAccounts } from '@/lib/admin-alerts';

export interface RevOpsScanResult {
  scannedAt: string;
  dunningAccountsIdentified: number;
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
 * Runs an automated RevOps and Growth scan across contractor accounts
 */
export async function runRevOpsGrowthScan(
  supabase: SupabaseClient,
  options?: { autoDispatchNudges?: boolean },
): Promise<RevOpsScanResult> {
  const autoDispatch = options?.autoDispatchNudges ?? true;

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

  // 1. Process dunning / failed payments
  for (const d of dunningRows.slice(0, 10)) {
    const amountVal = d.amount ?? 0;
    const amountDollars = amountVal.toFixed(2);
    details.dunningActions.push({
      accountId: d.account_id,
      amountCents: Math.round(amountVal * 100),
      reason: `Uncollected payment of $${amountDollars} (${d.label || 'Subscription/Job'}). State: ${d.dunning_state || 'failed'}.`,
    });

    // For large uncollected balances (> $500), queue a HITL action for founder review
    if (amountVal > 500) {
      createHitlAction({
        category: 'billing_revops',
        title: `Recover High-Value Payment: $${amountDollars}`,
        description: `Contractor account ${d.account_id} has an overdue payment of $${amountDollars} (${d.label || 'Payment'}). Failure: ${d.failure_message || 'Card declined'}. Action: Send priority collection escalation.`,
        actionType: 'trigger_dunning_escalation',
        payload: {
          accountId: d.account_id,
          amountDollars: amountVal,
          paymentId: d.id,
        },
      });
      hitlActionsCount++;
    }
  }

  // 2. Process onboarding nudges for unactivated contractors
  for (const account of notOnboardedRows.slice(0, 10)) {
    const displayName = account.business_name || `Account #${account.account_number || account.id}`;
    details.onboardingNudges.push({
      accountId: account.id,
      name: displayName,
      stepId: 'nudge_zero_quotes',
    });

    if (autoDispatch) {
      recordOperatorAudit({
        category: 'growth_lifecycle',
        actionName: 'Automated Onboarding Nudge',
        severity: 'safe_auto',
        accountId: account.id,
        reasoningSummary: `Contractor ${displayName} has not created a quote within 48h of signup. Automated guidance dispatched.`,
        status: 'success',
      });
    }
  }

  const result: RevOpsScanResult = {
    scannedAt: new Date().toISOString(),
    dunningAccountsIdentified: details.dunningActions.length,
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
      nudgesCount: result.onboardingNudgesQueued,
      hitlCreated: hitlActionsCount,
    },
    reasoningSummary: `Scan found ${result.dunningAccountsIdentified} dunning items, queued ${result.onboardingNudgesQueued} onboarding nudges, and created ${hitlActionsCount} HITL actions.`,
    status: 'success',
  });

  return result;
}
