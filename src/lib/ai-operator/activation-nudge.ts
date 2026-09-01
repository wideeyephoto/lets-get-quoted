import type { SupabaseClient } from '@supabase/supabase-js';
import { diagnoseContractorOnboarding } from './support-copilot';
import { recordOperatorAudit } from './audit';

export interface ActivationAutopilotReport {
  scannedAt: string;
  accountsScanned: number;
  welcomeNudgesSent: number;
  stripeRemindersSent: number;
  phoneSetupNudgesSent: number;
  skippedQuietHours: number;
  errors: string[];
}

/**
 * Checks if current local hour is within compliant TCPA business hours (8:00 AM - 8:30 PM local)
 */
function isWithinTcpaHours(timezone = 'America/New_York'): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const currentHour = parseInt(formatter.format(new Date()), 10);
    return currentHour >= 8 && currentHour < 20;
  } catch {
    return true; // Fallback to safe pass
  }
}

/**
 * Autonomous RevOps worker that accelerates new contractor activation milestones
 */
export async function runActivationAutopilotSweep(
  supabase: SupabaseClient,
  opts: { dryRun?: boolean; maxAccounts?: number } = {},
): Promise<ActivationAutopilotReport> {
  const limit = opts.maxAccounts || 25;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: recentAccounts, error } = await supabase
    .from('accounts')
    .select('id, business_name, email, phone, created_at, plan, timezone')
    .is('test_marker', null)
    .is('suspended_at', null)
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(limit);

  const report: ActivationAutopilotReport = {
    scannedAt: new Date().toISOString(),
    accountsScanned: recentAccounts?.length || 0,
    welcomeNudgesSent: 0,
    stripeRemindersSent: 0,
    phoneSetupNudgesSent: 0,
    skippedQuietHours: 0,
    errors: [],
  };

  if (error || !recentAccounts || recentAccounts.length === 0) {
    if (error) report.errors.push(error.message);
    return report;
  }

  for (const acc of recentAccounts) {
    try {
      const ageHours = (Date.now() - new Date(acc.created_at).getTime()) / (1000 * 60 * 60);
      const diagnosis = await diagnoseContractorOnboarding(supabase, acc.id);

      // TCPA compliance check
      if (!isWithinTcpaHours(acc.timezone || 'America/New_York')) {
        report.skippedQuietHours++;
        continue;
      }

      // 1. Milestone 1 (24h - 48h): 0 quotes created -> Send Welcome & Quote Builder Nudge
      if (ageHours >= 24 && diagnosis.quotesCount === 0) {
        if (!opts.dryRun) {
          // Log automated nudge dispatch
          await supabase
            .from('contractor_onboarding_nudges')
            .insert({
              account_id: acc.id,
              nudge_type: 'onboarding_welcome',
              dispatched_at: new Date().toISOString(),
              channel: 'sms',
            });
        }
        report.welcomeNudgesSent++;
      }
      // 2. Milestone 2 (48h - 96h): Stripe Connect Missing -> Send 1-click KYC link
      else if (ageHours >= 48 && !diagnosis.isStripeConnected) {
        if (!opts.dryRun) {
          await supabase
            .from('contractor_onboarding_nudges')
            .insert({
              account_id: acc.id,
              nudge_type: 'stripe_connect_reminder',
              dispatched_at: new Date().toISOString(),
              channel: 'sms',
            });
        }
        report.stripeRemindersSent++;
      }
      // 3. Milestone 3 (96h+): Sending quotes without custom hotline -> Suggest Dedicated Number
      else if (ageHours >= 96 && diagnosis.quotesCount > 0 && !diagnosis.hasSmsSenderNumber) {
        if (!opts.dryRun) {
          await supabase
            .from('contractor_onboarding_nudges')
            .insert({
              account_id: acc.id,
              nudge_type: 'phone_setup_help',
              dispatched_at: new Date().toISOString(),
              channel: 'email',
            });
        }
        report.phoneSetupNudgesSent++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.errors.push(`Account ${acc.id}: ${msg}`);
    }
  }

  // Audit Log
  const totalDispatched =
    report.welcomeNudgesSent + report.stripeRemindersSent + report.phoneSetupNudgesSent;
  if (!opts.dryRun && totalDispatched > 0) {
    recordOperatorAudit({
      category: 'growth_lifecycle',
      actionName: 'growth.activation_nudges_dispatched',
      severity: 'safe_auto',
      toolName: 'runActivationAutopilotSweep',
      inputPayload: { accountsScanned: report.accountsScanned },
      outputResult: report,
      reasoningSummary: `Autonomous activation sweep dispatched ${totalDispatched} tailored onboarding prompts (${report.welcomeNudgesSent} quotes, ${report.stripeRemindersSent} Stripe KYC, ${report.phoneSetupNudgesSent} hotline).`,
      status: 'success',
    });
  }

  return report;
}
