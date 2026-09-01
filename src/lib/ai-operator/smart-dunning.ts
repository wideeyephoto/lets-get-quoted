import type { SupabaseClient } from '@supabase/supabase-js';
import { getPaymentsNeedingAttention } from '@/lib/admin-alerts';
import { recordOperatorAudit } from './audit';

export interface SmartDunningReport {
  scannedAt: string;
  totalDunningAccounts: number;
  retriesOptimized: number;
  gracePeriodsApplied: number;
  cardUpdateLinksDispatched: number;
  errors: string[];
}

/**
 * Computes optimal next retry timestamp based on decline code
 */
export function calculateOptimalRetryTimestamp(
  declineCode = 'generic_decline',
  baseDate = new Date(),
): { nextRetry: string; strategy: string } {
  const d = new Date(baseDate);

  switch (declineCode.toLowerCase()) {
    case 'insufficient_funds': {
      // Advance to upcoming Friday afternoon at 2 PM local or +3 days
      const day = d.getDay();
      const daysUntilFriday = (5 - day + 7) % 7 || 3;
      d.setDate(d.getDate() + daysUntilFriday);
      d.setHours(14, 0, 0, 0);
      return { nextRetry: d.toISOString(), strategy: 'payroll_cycle_alignment' };
    }

    case 'processing_error':
    case 'issuer_unavailable':
    case 'rate_limit': {
      // Transient provider/network glitch: retry in 6 hours
      d.setHours(d.getHours() + 6);
      return { nextRetry: d.toISOString(), strategy: 'transient_network_backoff' };
    }

    case 'expired_card':
    case 'lost_card':
    case 'stolen_card':
    case 'do_not_honor': {
      // Non-retryable: freeze retries and request updated card
      return { nextRetry: d.toISOString(), strategy: 'immediate_card_update_required' };
    }

    default: {
      // Standard schedule: retry in 48 hours
      d.setDate(d.getDate() + 2);
      return { nextRetry: d.toISOString(), strategy: 'standard_48h_schedule' };
    }
  }
}

/**
 * Autonomous RevOps worker that recovers failed subscription & invoice collections
 */
export async function runSmartDunningSweep(
  supabase: SupabaseClient,
  opts: { dryRun?: boolean } = {},
): Promise<SmartDunningReport> {
  const dunningList = await getPaymentsNeedingAttention(supabase).catch(() => []);

  const report: SmartDunningReport = {
    scannedAt: new Date().toISOString(),
    totalDunningAccounts: dunningList.length,
    retriesOptimized: 0,
    gracePeriodsApplied: 0,
    cardUpdateLinksDispatched: 0,
    errors: [],
  };

  if (dunningList.length === 0) {
    return report;
  }

  for (const item of dunningList) {
    try {
      const declineCode = (item as Record<string, unknown>).decline_code as string || 'generic_decline';
      const { nextRetry, strategy } = calculateOptimalRetryTimestamp(declineCode);

      if (strategy === 'immediate_card_update_required') {
        if (!opts.dryRun) {
          // Dispatch payment update reminder link
          await supabase
            .from('dunning_events')
            .insert({
              account_id: item.account_id,
              action: 'card_update_prompt_sent',
              dispatched_at: new Date().toISOString(),
              strategy,
            });
        }
        report.cardUpdateLinksDispatched++;
      } else {
        if (!opts.dryRun) {
          // Update smart retry schedule in database
          await supabase
            .from('payments')
            .update({
              next_retry_at: nextRetry,
              dunning_strategy: strategy,
            })
            .eq('id', item.id);
        }
        report.retriesOptimized++;
      }

      // Check if contractor has active quotes/jobs in progress -> grant 3-day grace period
      if (item.account_id) {
        const { count: activeJobs } = await supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', item.account_id)
          .in('status', ['scheduled', 'in_progress']);

        if ((activeJobs || 0) > 0) {
          if (!opts.dryRun) {
            await supabase
              .from('accounts')
              .update({
                grace_period_until: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
              })
              .eq('id', item.account_id);
          }
          report.gracePeriodsApplied++;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.errors.push(`Payment ${item.id}: ${msg}`);
    }
  }

  // Audit Logging
  if (!opts.dryRun && (report.retriesOptimized > 0 || report.gracePeriodsApplied > 0)) {
    recordOperatorAudit({
      category: 'billing_revops',
      actionName: 'billing.dunning_autopilot_optimized',
      severity: 'safe_auto',
      toolName: 'runSmartDunningSweep',
      inputPayload: { scanned: dunningList.length },
      outputResult: report,
      reasoningSummary: `Smart dunning optimized ${report.retriesOptimized} payment retries, granted ${report.gracePeriodsApplied} active-job grace periods, and dispatched ${report.cardUpdateLinksDispatched} card update links.`,
      status: 'success',
    });
  }

  return report;
}
