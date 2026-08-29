import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { getJob, listCosts, computeMargin, formatMoney, formatMoneyExact, type Cost } from '@/lib/jobs';
import { marginVerdict, costConfidence, DEFAULT_MIN_MARGIN_PCT } from '@/lib/cost-truth';
import { createJobFeedEvent } from '@/lib/job-feed';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { APP_ORIGIN } from '@/lib/app-origin';

export interface MarginAlertEvaluation {
  triggered: boolean;
  reason?: 'below_floor' | 'running_loss';
  marginPct: number;
  floorPct: number;
  profit: number;
  totalCost: number;
  revenue: number;
  emailSent?: boolean;
  feedEventCreated?: boolean;
  message?: string;
}

/**
 * Cooldown window in milliseconds between email alerts for the same job.
 * Avoids spamming the contractor if multiple small receipts are entered consecutively.
 */
const MARGIN_ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Evaluates whether a newly added or updated cost causes a job's gross margin
 * to dip below the account's configured margin floor or into a loss.
 *
 * Dispatches an internal timeline activity feed event and sends an alert email
 * to the business owner if outside the cooldown window.
 *
 * NEVER THROWS: A failure in alert delivery must never fail the underlying cost write.
 */
export async function evaluateAndTriggerMarginAlert(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  newlyAddedCost?: Pick<Cost, 'description' | 'amount' | 'type'> | null,
): Promise<MarginAlertEvaluation> {
  try {
    const admin = createAdminClient();
    const [job, costs, { data: account }] = await Promise.all([
      getJob(admin, accountId, jobId),
      listCosts(admin, accountId, jobId),
      admin
        .from('accounts')
        .select('business_name, min_margin_pct')
        .eq('id', accountId)
        .maybeSingle(),
    ]);

    if (!job) {
      return { triggered: false, marginPct: 0, floorPct: 0, profit: 0, totalCost: 0, revenue: 0 };
    }

    const minMarginPct = Number(account?.min_margin_pct) || DEFAULT_MIN_MARGIN_PCT;
    const margin = computeMargin(job, costs);
    const confidence = costConfidence(
      costs.map((c) => ({
        amount: Number(c.amount) || 0,
        burdenAmount: Number(c.burden_amount) || 0,
        source: c.cost_source,
      })),
    );

    const verdict = marginVerdict({
      revenue: margin.revenue,
      totalCost: margin.totalCost,
      minMarginPct,
      evidencedPct: confidence.evidencedPct,
    });

    const marginPctRounded = Math.round(margin.margin * 100);

    if (!verdict.below && !verdict.losing) {
      return {
        triggered: false,
        marginPct: marginPctRounded,
        floorPct: minMarginPct,
        profit: margin.profit,
        totalCost: margin.totalCost,
        revenue: margin.revenue,
      };
    }

    const reason = verdict.losing ? 'running_loss' : 'below_floor';
    const costText = newlyAddedCost
      ? `After logging "${newlyAddedCost.description}" ($${Number(newlyAddedCost.amount).toFixed(2)}), job`
      : 'Job';

    const alertMessage = verdict.losing
      ? `${costText} ${job.ref} is running at a LOSS (${marginPctRounded}% margin · Profit: ${formatMoney(margin.profit)}). Quoted: ${formatMoney(margin.revenue)}, Total Cost: ${formatMoney(margin.totalCost)}.`
      : `${costText} ${job.ref} margin dropped to ${marginPctRounded}%, below your ${minMarginPct}% target floor. Quoted: ${formatMoney(margin.revenue)}, Total Cost: ${formatMoney(margin.totalCost)}.`;

    // 1. Post internal job activity feed event
    let feedEventCreated = false;
    try {
      await createJobFeedEvent(admin, accountId, jobId, {
        kind: 'margin_alert',
        title: verdict.losing ? '⚠️ Profit Warning: Job Operating at Loss' : '⚠️ Margin Warning: Below Floor Target',
        body: alertMessage,
        visibility: 'internal',
        author: 'Margin Sentinel',
        amount: margin.profit,
      });
      feedEventCreated = true;
    } catch (feedError) {
      console.error('Failed to post margin alert to job feed:', feedError);
    }

    // 2. Check cooldown for email delivery using recent activity feed events
    let emailSent = false;
    try {
      const cooldownSince = new Date(Date.now() - MARGIN_ALERT_COOLDOWN_MS).toISOString();
      const { data: recentAlerts } = await admin
        .from('job_activity_feed')
        .select('id, created_at')
        .eq('account_id', accountId)
        .eq('job_id', jobId)
        .eq('kind', 'margin_alert')
        .gt('created_at', cooldownSince);

      // If more than 1 alert in the last 4h (including the one just created), suppress email
      const shouldSendEmail = (recentAlerts?.length ?? 0) <= 1;

      if (shouldSendEmail) {
        const ownerEmail = await getAccountOwnerEmail(admin, accountId);
        if (ownerEmail) {
          const businessName = account?.business_name || 'Your Business';
          const jobUrl = `${APP_ORIGIN}/dashboard/jobs/${jobId}?open=costs`;

          await sendContractorAlertEmail({
            accountId,
            recipientEmail: ownerEmail,
            businessName,
            subject: verdict.losing
              ? `⚠️ Loss Alert: Job ${job.ref} (${job.client_name}) is operating at a loss`
              : `⚠️ Margin Alert: Job ${job.ref} (${job.client_name}) fell below ${minMarginPct}% floor`,
            heading: verdict.losing ? 'Job Operating at a Loss' : 'Job Margin Below Floor Target',
            bodyLines: [
              `Job: ${job.ref} — ${job.client_name}`,
              `Current Margin: ${marginPctRounded}% (Target Floor: ${minMarginPct}%)`,
              `Quoted Price: ${formatMoneyExact(margin.revenue)}`,
              `Total Logged Costs: ${formatMoneyExact(margin.totalCost)} (Net Profit: ${formatMoneyExact(margin.profit)})`,
              newlyAddedCost
                ? `Recent Expense: "${newlyAddedCost.description}" — $${Number(newlyAddedCost.amount).toFixed(2)} (${newlyAddedCost.type})`
                : 'A recent expense adjustment pushed costs above the margin threshold.',
              'Review line items or issue a change order if additional scope was required.',
            ],
            ctaLabel: 'Review Job Costs & Margins',
            ctaUrl: jobUrl,
            tone: 'warning',
          });
          emailSent = true;
        }
      }
    } catch (emailErr) {
      console.error('Failed to dispatch contractor margin alert email:', emailErr);
    }

    return {
      triggered: true,
      reason,
      marginPct: marginPctRounded,
      floorPct: minMarginPct,
      profit: margin.profit,
      totalCost: margin.totalCost,
      revenue: margin.revenue,
      emailSent,
      feedEventCreated,
      message: alertMessage,
    };
  } catch (error) {
    console.error('Error in evaluateAndTriggerMarginAlert:', error);
    return { triggered: false, marginPct: 0, floorPct: 0, profit: 0, totalCost: 0, revenue: 0 };
  }
}
