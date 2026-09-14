import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase-admin';
import { getJob, listCosts, computeMargin, formatMoney, type Cost } from '@/lib/jobs';
import { marginVerdict, costConfidence, DEFAULT_MIN_MARGIN_PCT } from '@/lib/cost-truth';
import {runOwnerEventNotices} from '@/lib/owner-event-notices';

export interface MarginAlertEvaluation {
  triggered: boolean;
  evaluationFailed?: boolean;
  reason?: 'below_floor' | 'running_loss';
  marginPct: number;
  floorPct: number;
  profit: number;
  totalCost: number;
  revenue: number;
  emailSent?: boolean;
  noticeSaved?: boolean;
  feedEventCreated?: boolean;
  message?: string;
}


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
  options: {dispatchOwner?:boolean} = {},
): Promise<MarginAlertEvaluation> {
  try {
    const admin = createAdminClient();
    const [job, costs, { data: account, error: accountError }] = await Promise.all([
      getJob(admin, accountId, jobId),
      listCosts(admin, accountId, jobId),
      admin
        .from('accounts')
        .select('business_name, min_margin_pct')
        .eq('id', accountId)
        .maybeSingle(),
    ]);

    if (accountError || !account) throw new Error("Could not read margin settings");
    if (!job) {
      return { triggered: false, marginPct: 0, floorPct: 0, profit: 0, totalCost: 0, revenue: 0 };
    }

    const configuredFloor = account.min_margin_pct == null ? DEFAULT_MIN_MARGIN_PCT : Number(account.min_margin_pct);
    if(!Number.isFinite(configuredFloor)) throw new Error('Invalid margin settings');
    const minMarginPct = Math.min(100,Math.max(0,configuredFloor));
    const margin = computeMargin(job, costs);
    if(![margin.revenue,margin.totalCost,margin.profit,margin.margin].every(Number.isFinite)) throw new Error('Invalid margin figures');
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

    const recordedMessage = verdict.losing
      ? `${costText} ${job.ref} is running at a LOSS (${marginPctRounded}% margin · Profit: ${formatMoney(margin.profit)}). Quoted: ${formatMoney(margin.revenue)}, Total Cost: ${formatMoney(margin.totalCost)}.`
      : `${costText} ${job.ref} margin dropped to ${marginPctRounded}%, below your ${minMarginPct}% target floor. Quoted: ${formatMoney(margin.revenue)}, Total Cost: ${formatMoney(margin.totalCost)}.`;

    const alertMessage = `At this check: ${recordedMessage}${confidence.evidencedPct<0.5?' Much of this cost is estimated; verify the figures.':''} Review current costs before acting.`;
    const saved=await admin.rpc('record_margin_owner_notice',{
      p_account_id:accountId,p_job_id:jobId,p_revenue:margin.revenue,p_total_cost:margin.totalCost,p_floor_pct:minMarginPct,
      p_title:verdict.losing?'Recorded profit warning: loss':'Recorded margin warning: below target',p_body:alertMessage,
    });
    if(saved.error || !saved.data?.feed_id) throw new Error('Could not save margin warning');
    const feedEventCreated=true;
    const noticeSaved=saved.data.notice_saved===true;
    let emailSent=false;
    if(noticeSaved && options.dispatchOwner!==false){
      try{const result=await runOwnerEventNotices(admin,{sourceId:saved.data.feed_id,accountId});emailSent=result.ownersNotified>0;}
      catch{console.error('Margin owner notice remains saved for pickup');}
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
      noticeSaved,
      feedEventCreated,
      message: alertMessage,
    };
  } catch (error) {
    console.error('Error in evaluateAndTriggerMarginAlert:', error);
    return { triggered: false, evaluationFailed:true, marginPct: 0, floorPct: 0, profit: 0, totalCost: 0, revenue: 0 };
  }
}
