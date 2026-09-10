import type { SupabaseClient } from '@supabase/supabase-js';
import { recordOperatorAudit, createHitlAction } from './audit';
import {
  getPaymentsNeedingAttention,
  getNotOnboardedAccounts,
  getZeroQuoteActivationCandidates,
} from '@/lib/admin-alerts';
import { ownerEmailsForAccounts } from '@/lib/admin-accounts';
import { classifyEmail } from '@/lib/email-quality';

export interface RevOpsScanResult {
  scannedAt: string;
  dunningAccountsIdentified: number;
  dunningTotalAmountCents: number;
  /**
   * Contractors identified as needing a nudge. Named "Queued" originally, which was
   * read as work performed and reported to the founder as safeActionsExecuted --
   * nothing is queued and nothing is sent, these are candidates for the HITL card.
   */
  onboardingNudgeCandidates: number;
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
 * - Identifies unactivated contractor signups (zero quotes) and queues targeted nudges
 * - Recommends plan tier upgrades for high-volume accounts
 */
export async function runRevOpsGrowthScan(
  supabase: SupabaseClient,
  options?: { autoDispatchNudges?: boolean; highValueThresholdDollars?: number },
): Promise<RevOpsScanResult> {
  const autoDispatch = options?.autoDispatchNudges ?? true;
  const highValueThreshold = options?.highValueThresholdDollars ?? 500;

  const [dunningRows, _notOnboardedRows, zeroQuoteCandidates] = await Promise.all([
    getPaymentsNeedingAttention(supabase).catch(() => []),
    getNotOnboardedAccounts(supabase).catch(() => []),
    getZeroQuoteActivationCandidates(supabase, { minAgeDays: 5, maxAgeDays: 15 }).catch(() => []),
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

  // 2. Process first-quote activation nudges for unactivated contractors (zero quotes)
  if (zeroQuoteCandidates.length > 0) {
    const candidateIds = zeroQuoteCandidates.map((a) => a.id);

    // Resolve owner emails, suppressions, and already-sent ledgers at queue time
    const [ownerEmailMap, suppressionsRes, sentEventsRes] = await Promise.all([
      ownerEmailsForAccounts(supabase, candidateIds).catch(() => new Map<string, string>()),
      supabase.from('email_suppression').select('account_id, email').in('account_id', candidateIds),
      supabase
        .from('account_events')
        .select('account_id, meta')
        .in('account_id', candidateIds)
        .eq('kind', 'contractor_lifecycle_email_sent'),
    ]);

    if (suppressionsRes.error || sentEventsRes.error || (sentEventsRes.data?.length ?? 0) >= 1000) {
      throw new Error('Activation audience checks unavailable; no approval card created.');
    }

    const suppressedSet = new Set<string>();
    for (const s of suppressionsRes.data ?? []) {
      if (s.email) suppressedSet.add(`${s.account_id}:${String(s.email).toLowerCase().trim()}`);
    }

    const sentAccountIds = new Set<string>();
    for (const ev of sentEventsRes.data ?? []) {
      const meta = ev.meta as Record<string, unknown> | null;
      if (meta?.step_id === 'nudge_zero_quotes') {
        sentAccountIds.add(ev.account_id);
      }
    }

    const recipients: Array<{
      accountId: string;
      businessName: string;
      email: string;
      ageDays: number;
      quotedJobs: number;
    }> = [];

    const skipped: Array<{
      accountId: string;
      businessName: string;
      reason: string;
    }> = [];

    for (const cand of zeroQuoteCandidates) {
      const bName = cand.business_name || `Account #${cand.account_number || cand.id}`;
      const email = ownerEmailMap.get(cand.id);

      if (!email) {
        skipped.push({ accountId: cand.id, businessName: bName, reason: 'no_email' });
        continue;
      }

      const cleanEmail = email.trim().toLowerCase();
      const verdict = classifyEmail(cleanEmail);
      if (!verdict.valid || verdict.junk) {
        skipped.push({
          accountId: cand.id,
          businessName: bName,
          reason: `not_mailable (${verdict.reason || 'invalid'})`,
        });
        continue;
      }

      if (suppressedSet.has(`${cand.id}:${cleanEmail}`)) {
        skipped.push({ accountId: cand.id, businessName: bName, reason: 'suppressed' });
        continue;
      }

      if (sentAccountIds.has(cand.id)) {
        skipped.push({ accountId: cand.id, businessName: bName, reason: 'already_sent' });
        continue;
      }

      recipients.push({
        accountId: cand.id,
        businessName: bName,
        email: cleanEmail,
        ageDays: cand.age_days,
        quotedJobs: cand.quoted_jobs,
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const deterministicId = `hitl-batch_activation_nudges-${today}`;

    // One outstanding activation batch at a time, including cards from prior days.
    const { data: pending, error: pendingError } = await supabase.from('ai_operator_action_requests')
      .select('id').eq('action_type', 'batch_activation_nudges').eq('status', 'pending').limit(1);
    if (pendingError) throw new Error('Could not check pending activation approvals.');

    if (recipients.length > 0 && !pending?.length) {
      createHitlAction(
        {
          id: deterministicId,
          category: 'growth_lifecycle',
          title: `Send First-Quote Activation Nudges (${recipients.length} Contractors)`,
          description: `${recipients.length} business owner(s) have no priced quote yet. Preview and approve a first-quote help email with a link to Jobs. Eligibility is checked again before sending (${skipped.length} skipped).`,
          actionType: 'batch_activation_nudges',
          payload: {
            stepId: 'nudge_zero_quotes',
            channel: 'email',
            generatedAt: new Date().toISOString(),
            recipients,
            skipped,
            accountIds: candidateIds,
            contractorCount: recipients.length,
          },
        },
        supabase,
      );
      hitlActionsCount++;
    }
  }

  for (const account of zeroQuoteCandidates.slice(0, 15)) {
    const displayName = account.business_name || `Account #${account.account_number || account.id}`;
    details.onboardingNudges.push({
      accountId: account.id,
      name: displayName,
      stepId: 'nudge_zero_quotes',
    });

    if (autoDispatch) {
      recordOperatorAudit(
        {
          category: 'growth_lifecycle',
          actionName: 'Onboarding Nudge Candidate Identified',
          severity: 'info',
          accountId: account.id,
          reasoningSummary: `Contractor ${displayName} has zero quotes. Identified as an activation nudge candidate; nothing was sent.`,
          status: 'success',
        },
        supabase,
      );
    }
  }

  const result: RevOpsScanResult = {
    scannedAt: new Date().toISOString(),
    dunningAccountsIdentified: details.dunningActions.length,
    dunningTotalAmountCents,
    onboardingNudgeCandidates: details.onboardingNudges.length,
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
      nudgeCandidates: result.onboardingNudgeCandidates,
      hitlCreated: hitlActionsCount,
    },
    reasoningSummary: `Scan found ${result.dunningAccountsIdentified} dunning items ($${(dunningTotalAmountCents / 100).toFixed(2)} total), identified ${result.onboardingNudgeCandidates} onboarding nudge candidate(s) (none sent), and created ${hitlActionsCount} HITL actions.`,
    status: 'success',
  });

  return result;
}
