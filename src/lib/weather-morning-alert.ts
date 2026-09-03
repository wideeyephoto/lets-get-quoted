import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { normalizeUsPhone } from '@/lib/phone';
import { jobsAtRisk } from '@/lib/weather-data';
import { sendWeatherMorningAlertSms } from '@/lib/sms';
import { recordAccountEvent } from '@/lib/account-events';
import { recordTenantAuditEvent } from '@/lib/tenant-audit';
import { zonedNowParts } from '@/lib/quick-stop';
import { APP_ORIGIN } from '@/lib/app-origin';

export type WeatherMorningAlertRunSummary = {
  candidates: number;
  alerted: number;
  skipped: number;
  errors: string[];
};

/**
 * Checks if the current local wall-clock time is in the 6:45 AM morning rollout window
 * (6:45 AM to 7:15 AM).
 */
export function isMorningWeatherAlertWindow(timeStr: string): boolean {
  return timeStr >= '06:45' && timeStr < '07:15';
}

/**
 * Formats a concise, actionable morning weather SMS sent to the contractor/owner
 * at 6:45 AM before trucks and crews leave for the day.
 */
export function buildMorningWeatherAlertText(params: {
  businessName: string;
  jobCount: number;
  clientNames: string[];
  reasons: string[];
  scheduleUrl: string;
}): string {
  const { businessName, jobCount, clientNames, reasons, scheduleUrl } = params;
  const reasonSummary = reasons.length > 0 ? reasons.slice(0, 2).join(', ') : 'adverse weather';
  const nameSummary = clientNames.slice(0, 3).join(', ') + (clientNames.length > 3 ? ` +${clientNames.length - 3} more` : '');
  const jobText = jobCount === 1 ? '1 scheduled job' : `${jobCount} scheduled jobs`;

  return `⛈️ Morning Weather Alert (6:45 AM): Today's forecast (${reasonSummary}) threatens ${jobText} for ${businessName}: ${nameSummary}. Review and 1-tap reschedule before crews roll: ${scheduleUrl}`;
}

/**
 * Sweeps all accounts with weather alerts enabled. For accounts where the local clock
 * is currently at 6:45 AM, checks today's outdoor jobs. If any are at risk, sends an
 * urgent internal operational alert to the contractor's mobile number.
 */
export async function runWeatherMorningAlerts(now = new Date()): Promise<WeatherMorningAlertRunSummary> {
  const admin = createAdminClient();
  const summary: WeatherMorningAlertRunSummary = {
    candidates: 0,
    alerted: 0,
    skipped: 0,
    errors: [],
  };

  const { data: accounts, error: accErr } = await admin
    .from('accounts')
    .select('id, business_name, timezone, alert_phone, weather_alerts_enabled')
    .eq('weather_alerts_enabled', true);

  if (accErr || !accounts) {
    summary.errors.push(accErr ? accErr.message : 'Could not query accounts');
    return summary;
  }

  for (const account of accounts) {
    const tz = (account.timezone as string) || 'America/New_York';
    const { dateKey, time } = zonedNowParts(now, tz);

    // Only fire during the 6:45 AM morning window (6:45 to 7:15 AM)
    if (!isMorningWeatherAlertWindow(time)) {
      continue;
    }

    summary.candidates++;

    const rawPhone = (account.alert_phone as string | null) || null;
    const alertPhone = rawPhone ? normalizeUsPhone(rawPhone) : null;
    if (!alertPhone) {
      summary.skipped++;
      continue;
    }

    // Idempotency: Has a 6:45 AM weather alert already been sent today?
    const { data: priorAlerts } = await admin
      .from('account_events')
      .select('id')
      .eq('account_id', account.id)
      .eq('kind', 'weather_morning_alert')
      .gte('created_at', `${dateKey}T00:00:00Z`)
      .limit(1);

    if (priorAlerts && priorAlerts.length > 0) {
      summary.skipped++;
      continue;
    }

    // Check today's at-risk jobs
    try {
      const risks = await jobsAtRisk(admin, account.id, { fromDay: dateKey, days: 1 });
      const todayRisks = risks.filter((r) => r.job.scheduledFor === dateKey && r.assessment.level !== 'clear');

      if (todayRisks.length === 0) {
        summary.skipped++;
        continue;
      }

      const allReasons = Array.from(new Set(todayRisks.flatMap((r) => r.assessment.reasons)));
      const clientNames = todayRisks.map((r) => r.job.clientName || 'Customer');
      const scheduleUrl = `${APP_ORIGIN}/dashboard/schedule?weather=check`;

      const alertBody = buildMorningWeatherAlertText({
        businessName: account.business_name || 'your business',
        jobCount: todayRisks.length,
        clientNames,
        reasons: allReasons,
        scheduleUrl,
      });

      const idempotencyKey = `weather-morning-alert:${account.id}:${dateKey}`;

      await sendWeatherMorningAlertSms({
        accountId: account.id,
        alertPhone,
        message: alertBody,
        idempotencyKey,
      });

      // Audit in account_events
      await recordAccountEvent({
        accountId: account.id,
        kind: 'weather_morning_alert',
        summary: `6:45 AM Morning Weather Alert: ${todayRisks.length} job(s) at risk today (${dateKey})`,
        actorEmail: 'system (weather cron)',
        meta: {
          dateKey,
          atRiskJobCount: todayRisks.length,
          atRiskJobIds: todayRisks.map((r) => r.job.id),
          reasons: allReasons,
        },
      });

      // Tenant audit
      await recordTenantAuditEvent({
        accountId: account.id,
        entityType: 'account',
        entityId: account.id,
        action: 'weather_morning_alert',
        actor: { role: 'system' },
        source: 'api',
        reason: `Automated 6:45 AM morning weather alert sent for ${todayRisks.length} at-risk jobs today`,
        changedFields: ['weather_morning_alert'],
        afterState: {
          dateKey,
          jobCount: todayRisks.length,
          alertPhone,
        },
      });

      summary.alerted++;
    } catch (err) {
      console.error(`Failed to process morning weather alert for account ${account.id}:`, err);
      summary.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return summary;
}
