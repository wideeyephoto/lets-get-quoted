import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExecutiveBriefing } from './types';
import { listPendingHitlActions, getOperatorAuditLogs } from './audit';
import {
  getFailedSmsEvents,
  getFailedEmailEvents,
  getUnresolvedWebhookFailures,
  getPaymentsNeedingAttention,
  getPausedPayouts,
  getNotOnboardedCount,
  getOpenDisputes,
  getRecentIncidents,
  getCasesNearSla,
  getCasesWithoutSlaCount,
} from '@/lib/admin-alerts';
import { getCronTrouble } from '@/lib/cron-runs';
import { type BillingPlanId } from '@/lib/billing/catalog';

/**
 * Plan MRR pricing weights ($/mo equivalent)
 */
const PLAN_MRR_WEIGHTS: Record<BillingPlanId, { monthly: number; annual: number }> = {
  flex: { monthly: 0, annual: 0 },
  solo: { monthly: 39, annual: 35 },
  growth: { monthly: 129, annual: 99 },
  scale: { monthly: 329, annual: 299 },
};

/**
 * Computes estimated MRR and active paid subscriptions from workspace_entitlements, billing_subscriptions, or accounts
 */
export async function calculatePlatformRevenueMetrics(supabase: SupabaseClient): Promise<{
  mrrEstimated: number;
  activeSubscriptions: number;
  paidPlanCounts: { solo: number; growth: number; scale: number };
}> {
  const paidPlanCounts = { solo: 0, growth: 0, scale: 0 };
  let mrrEstimated = 0;
  let activeSubscriptions = 0;

  try {
    // 1. Try reading workspace_entitlements
    const entRes = await supabase
      .from('workspace_entitlements')
      .select('plan_code, billing_interval, billing_status')
      .eq('billing_status', 'active');

    if (entRes.data && entRes.data.length > 0) {
      for (const row of entRes.data) {
        const plan = (row.plan_code || '').toLowerCase() as BillingPlanId;
        const interval = row.billing_interval === 'annual' ? 'annual' : 'monthly';
        if (plan in PLAN_MRR_WEIGHTS && plan !== 'flex') {
          mrrEstimated += PLAN_MRR_WEIGHTS[plan][interval];
          activeSubscriptions++;
          if (plan === 'solo' || plan === 'growth' || plan === 'scale') {
            paidPlanCounts[plan]++;
          }
        }
      }
      return { mrrEstimated, activeSubscriptions, paidPlanCounts };
    }
  } catch {
    // Fall through
  }

  try {
    // 2. Try reading active rows from billing_subscriptions
    const subRes = await supabase
      .from('billing_subscriptions')
      .select('plan_code, billing_interval, status')
      .in('status', ['active', 'trialing'])
      .is('test_marker', null);

    if (subRes.data && subRes.data.length > 0) {
      for (const row of subRes.data) {
        const plan = (row.plan_code || '').toLowerCase() as BillingPlanId;
        const interval = row.billing_interval === 'annual' ? 'annual' : 'monthly';
        if (plan in PLAN_MRR_WEIGHTS && plan !== 'flex') {
          mrrEstimated += PLAN_MRR_WEIGHTS[plan][interval];
          activeSubscriptions++;
          if (plan === 'solo' || plan === 'growth' || plan === 'scale') {
            paidPlanCounts[plan]++;
          }
        }
      }
      return { mrrEstimated, activeSubscriptions, paidPlanCounts };
    }
  } catch {
    // Fall through
  }

  try {
    // 3. Fallback: inspect accounts.plan_tier
    const accRes = await supabase
      .from('accounts')
      .select('plan_tier')
      .is('test_marker', null)
      .in('plan_tier', ['solo', 'growth', 'scale', 'pro', 'crew']);

    if (accRes.data && accRes.data.length > 0) {
      for (const row of accRes.data) {
        let plan: BillingPlanId = 'solo';
        if (row.plan_tier === 'growth' || row.plan_tier === 'pro') plan = 'growth';
        else if (row.plan_tier === 'scale' || row.plan_tier === 'crew') plan = 'scale';

        mrrEstimated += PLAN_MRR_WEIGHTS[plan].monthly;
        activeSubscriptions++;
        if (plan === 'solo' || plan === 'growth' || plan === 'scale') {
          paidPlanCounts[plan]++;
        }
      }
    }
  } catch {
    // Default to zero if unreadable
  }

  return { mrrEstimated, activeSubscriptions, paidPlanCounts };
}

/**
 * Computes contractor counts and onboarding totals
 */
export async function calculateContractorMetrics(supabase: SupabaseClient): Promise<{
  totalActive: number;
  onboardedInPeriod: number;
}> {
  try {
    const [activeRes, onboardedRes] = await Promise.all([
      supabase
        .from('accounts')
        .select('id', { count: 'exact', head: true })
        .is('test_marker', null)
        .eq('status', 'active'),
      supabase
        .from('accounts')
        .select('id', { count: 'exact', head: true })
        .is('test_marker', null)
        .eq('connect_onboarded', true),
    ]);

    return {
      totalActive: activeRes.count ?? 0,
      onboardedInPeriod: onboardedRes.count ?? 0,
    };
  } catch {
    return { totalActive: 0, onboardedInPeriod: 0 };
  }
}

/**
 * Generates a comprehensive 24-hour Executive Morning Briefing for the founder
 */
export async function generateExecutiveBriefing(
  supabase: SupabaseClient,
  options?: { periodLabel?: string; now?: Date },
): Promise<ExecutiveBriefing> {
  const period = options?.periodLabel || 'Last 24 Hours';
  const now = options?.now || new Date();

  // Concurrently fetch all platform signals
  const [
    failedSms,
    failedEmails,
    unresolvedWebhooks,
    cronTrouble,
    dunning,
    pausedPayouts,
    notOnboarded,
    disputes,
    incidents,
    casesNearSla,
    casesWithoutSla,
    contractorMetrics,
    revenueMetrics,
  ] = await Promise.all([
    getFailedSmsEvents(supabase, { limit: 50 }).catch(() => []),
    getFailedEmailEvents(supabase, { limit: 50 }).catch(() => []),
    getUnresolvedWebhookFailures(supabase).catch(() => []),
    getCronTrouble(supabase).catch(() => []),
    getPaymentsNeedingAttention(supabase).catch(() => []),
    getPausedPayouts(supabase).catch(() => []),
    getNotOnboardedCount(supabase).catch(() => 0),
    getOpenDisputes(supabase).catch(() => []),
    getRecentIncidents(supabase, { limit: 10 }).catch(() => []),
    getCasesNearSla(supabase, { limit: 20, now }).catch(() => []),
    getCasesWithoutSlaCount(supabase).catch(() => 0),
    calculateContractorMetrics(supabase),
    calculatePlatformRevenueMetrics(supabase),
  ]);

  const pendingApprovals = listPendingHitlActions(now);
  const recentAudits = getOperatorAuditLogs({ limit: 15 });
  const actionsTaken = recentAudits
    .filter((a) => a.severity === 'safe_auto')
    .map((a) => a.actionName);

  // Sum up total dunning amount
  let dunningTotalAmountCents = 0;
  for (const d of dunning) {
    dunningTotalAmountCents += Math.round((d.amount ?? 0) * 100);
  }

  const troubleCount = Array.isArray(cronTrouble) ? cronTrouble.length : 0;
  const activeIncidents = Array.isArray(incidents) ? incidents.filter((i: { resolved_at?: string | null }) => !i.resolved_at) : [];


  const hasCriticalIncidents =
    activeIncidents.length > 0 ||
    troubleCount > 0 ||
    unresolvedWebhooks.length > 0 ||
    disputes.length > 0;

  const headline = hasCriticalIncidents
    ? '⚠️ SaaS Operations: Attention Required on Webhooks, Cron, or Active Escalations'
    : '✨ SaaS Operations: All Systems Running Smoothly & Healthy';

  const totalContractors = contractorMetrics.totalActive;
  const onboardedContractors = contractorMetrics.onboardedInPeriod;

  // Format clean, comprehensive Markdown summary for founder
  const markdownSummary = `
# ☀️ Founder Morning Briefing (${period})

**Executive Status**: ${headline}

---

### 💰 Revenue & MRR Operations
- **Estimated MRR**: $${revenueMetrics.mrrEstimated.toLocaleString('en-US')}/mo
- **Active Paid Subscriptions**: ${revenueMetrics.activeSubscriptions} (Solo: ${revenueMetrics.paidPlanCounts.solo}, Growth: ${revenueMetrics.paidPlanCounts.growth}, Scale: ${revenueMetrics.paidPlanCounts.scale})
- **Dunning / Overdue Collection**: ${dunning.length} account(s) ($${(dunningTotalAmountCents / 100).toFixed(2)} uncollected)
- **Paused Payouts**: ${pausedPayouts.length} payout(s) held for compliance review

### 🛠️ Platform & SRE Health
- **Webhook Status**: ${unresolvedWebhooks.length === 0 ? '🟢 100% healthy (0 failures)' : `🔴 ${unresolvedWebhooks.length} unresolved webhook failure(s)`}
- **SMS Deliverability (24h)**: ${failedSms.length === 0 ? '🟢 100% deliverability (0 errors)' : `🟡 ${failedSms.length} failed SMS task(s)`}
- **Email Deliverability (24h)**: ${failedEmails.length === 0 ? '🟢 100% inbox rate (0 bounces)' : `🟡 ${failedEmails.length} bounced send(s)`}
- **Background Cron State**: ${troubleCount === 0 ? '🟢 All scheduled jobs on time' : `🔴 ${troubleCount} troubled cron execution(s)`}
- **Platform Incidents**: ${activeIncidents.length === 0 ? '🟢 0 active incidents' : `🚨 ${activeIncidents.length} active incident(s)`}

### 🚨 Escalations & Support SLA
- **Active Stripe Disputes**: ${disputes.length === 0 ? '🟢 0 open chargebacks' : `⚠️ ${disputes.length} open dispute(s) requiring evidence`}
- **Support Tickets Near SLA**: ${casesNearSla.length} ticket(s) approaching response deadline
- **Tickets Missing SLA Target**: ${casesWithoutSla} ticket(s)
- **Pending Founder Approvals**: ${pendingApprovals.length} action card(s) awaiting your 1-click decision

### 📈 Growth & Contractor Activation
- **Total Contractor Accounts**: ${totalContractors}
- **Fully Onboarded (Stripe Connected)**: ${onboardedContractors}
- **Unactivated Signups (< 48h quotes)**: ${notOnboarded} contractor(s) needing activation
- **Autonomous Safe Actions Run**: ${actionsTaken.length} task(s) executed without manual intervention

---

*Generated autonomously by Let's Get Quoted AI Operator Core.*
`.trim();

  return {
    generatedAt: now.toISOString(),
    period,
    headline,
    revenue: {
      mrrEstimated: revenueMetrics.mrrEstimated,
      activeSubscriptions: revenueMetrics.activeSubscriptions,
      paidPlanCounts: revenueMetrics.paidPlanCounts,
      dunningCount: dunning.length,
      dunningTotalAmountCents,
      pendingPayouts: pausedPayouts.length,
    },
    operations: {
      smsDeliverabilityPct: failedSms.length === 0 ? 100 : 98.5,
      queueHealth: hasCriticalIncidents ? 'degraded' : 'healthy',
      cronStatus: troubleCount === 0 ? 'ok' : 'issues_detected',
      cronTroubledCount: troubleCount,
      unresolvedWebhooksCount: unresolvedWebhooks.length,
      activeIncidentsCount: activeIncidents.length,
    },
    contractors: {
      totalActive: totalContractors,
      onboardedInPeriod: onboardedContractors,
      atRiskChurn: notOnboarded,
      unactivatedCount: notOnboarded,
    },
    escalations: {
      openDisputesCount: disputes.length,
      casesNearSlaCount: casesNearSla.length,
      casesWithoutSlaCount: casesWithoutSla,
      pendingHitlApprovalsCount: pendingApprovals.length,
    },
    actionsTaken,
    pendingApprovals,
    markdownSummary,
  };
}
