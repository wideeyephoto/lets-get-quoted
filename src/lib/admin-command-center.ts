import type { SupabaseClient } from '@supabase/supabase-js';
import type { StaffRole } from '@/lib/auth';
import {
  getOpenDisputes,
  getPausedPayouts,
  getSuspendedAccounts,
  getNotOnboardedCount,
  getNotOnboardedAccounts,
  getPaymentsNeedingAttention,
  getOverdueQuickStops,
  getFailedSmsEvents,
  getFailedEmailEvents,
  getUnresolvedWebhookFailures,
  getRecentIncidents,
  getCasesNearSla,
  getCasesWithoutSlaCount,
  getMyAssignedCases,
  getOpenPrivacyRequests,
  createAdminSignalDiagnostics,
  type AdminSignalKey,
  type DisputeRow,
  type PausedPayoutRow,
  type SuspendedAccountRow,
  type NotOnboardedAccountRow,
  type DunningPaymentRow,
  type OverdueQuickStopRow,
  type FailedSmsEventRow,
  type FailedEmailEventRow,
  type WebhookFailureRow,
  type PlatformIncidentRow,
  type SupportCaseRow,
  type OpenPrivacyRequestRow,
} from '@/lib/admin-alerts';
import { rangeWindow, computeTrend, type DateRange } from '@/lib/command-center-logic';
import { fetchFeeWindow } from '@/lib/platform-fees';
import { getCronTrouble, type CronTrouble } from '@/lib/cron-runs';

export type { DateRange } from '@/lib/command-center-logic';

export type CommandCenterMetric = {
  key: string;
  label: string;
  format: 'number' | 'usd';
  // Which direction is an improvement — revenue trending up is good, refunds
  // trending up is not. Drives the color the page renders the trend in.
  goodDirection: 'up' | 'down';
  value: number;
  previousValue: number;
  deltaPct: number | null;
  direction: 'up' | 'down' | 'flat';
  /** False means at least one query needed for this value or comparison failed. */
  available: boolean;
};

export type CommandCenterData = {
  range: DateRange;
  metrics: CommandCenterMetric[];
  disputes: DisputeRow[];
  pausedPayouts: PausedPayoutRow[];
  suspendedAccounts: SuspendedAccountRow[];
  notOnboardedCount: number;
  notOnboardedAccounts: NotOnboardedAccountRow[];
  dunningPayments: DunningPaymentRow[];
  overdueQuickStops: OverdueQuickStopRow[];
  failedSms: FailedSmsEventRow[];
  failedEmails: FailedEmailEventRow[];
  webhookFailures: WebhookFailureRow[];
  incidents: PlatformIncidentRow[];
  privacyRequests: OpenPrivacyRequestRow[];
  casesNearSla: SupportCaseRow[];
  /** Open cases the SLA card cannot see, because they have no SLA set. */
  casesWithoutSla: number;
  myCases: SupportCaseRow[];
  /** Scheduled jobs that are failing or overdue. See lib/cron-jobs.ts. */
  cronTrouble: CronTrouble[];
  /** Signals whose source query failed; these must never enter All clear. */
  unavailableSignals: AdminSignalKey[];
};

type MetricsWindow = {
  newAccounts: number;
  paymentsProcessed: number;
  /** NET of fees handed back with refunds issued in the same window. */
  platformFees: number;
  refunds: number;
  availability: {
    newAccounts: boolean;
    paymentsProcessed: boolean;
    platformFees: boolean;
    refunds: boolean;
  };
};

// One window's worth of the "core metrics" row. Never throws — a Postgres
// error surfaces via `.error` on each response, not an exception, so this
// degrades to zeros exactly like every fetcher in admin-alerts.ts rather than
// needing its own try/catch.
//
// The fee half now comes from lib/platform-fees.ts rather than being computed
// here. It used to be a second copy of the Money page's query, and both copies
// carried the same defect: gross summed over `status = 'paid'` while reversals
// summed over anything refunded in the window, so a payment refunded in full
// left the first population, stayed in the second, and drove the headline
// figure negative. One definition is the fix; see that file for the detail.
async function fetchMetricsWindow(admin: SupabaseClient, startIso: string, endIso: string): Promise<MetricsWindow> {
  const [accountsRes, fees] = await Promise.all([
    admin.from('accounts').select('id', { count: 'exact', head: true }).is('test_marker', null).gte('created_at', startIso).lt('created_at', endIso),
    fetchFeeWindow(admin, startIso, endIso),
  ]);
  if (accountsRes.error) console.error('command center metrics (new accounts) failed:', accountsRes.error);

  return {
    newAccounts: accountsRes.count ?? 0,
    paymentsProcessed: fees.paymentsProcessed,
    platformFees: fees.netFees,
    refunds: fees.refunds,
    availability: {
      newAccounts: !accountsRes.error,
      paymentsProcessed: fees.availability.payments,
      platformFees: fees.availability.fees && fees.availability.refunds,
      refunds: fees.availability.refunds,
    },
  };
}

// Everything the Command Center renders, in one call. Promise.all across every
// admin-alerts.ts fetcher (each already best-effort/never-throws on its own,
// same architecture as buildDailyDigest) plus the core-metrics window pair —
// one signal failing never blanks the rest of the page.
export async function buildCommandCenterData(
  admin: SupabaseClient,
  opts: { role: StaffRole; staffEmail: string; range?: DateRange; now?: Date },
): Promise<CommandCenterData> {
  const range = opts.range ?? '30d';
  const now = opts.now ?? new Date();
  const win = rangeWindow(range, now);
  const diagnostics = createAdminSignalDiagnostics();
  const withDiagnostics = { diagnostics };

  const [
    currentWindow,
    previousWindow,
    disputes,
    pausedPayouts,
    suspendedAccounts,
    notOnboardedCount,
    notOnboardedAccounts,
    dunningPayments,
    overdueQuickStops,
    failedSms,
    failedEmails,
    webhookFailures,
    incidents,
    privacyRequests,
    casesNearSla,
    casesWithoutSla,
    myCases,
    cronTrouble,
  ] = await Promise.all([
    fetchMetricsWindow(admin, win.currentStart, win.currentEnd),
    fetchMetricsWindow(admin, win.previousStart, win.previousEnd),
    getOpenDisputes(admin, withDiagnostics),
    getPausedPayouts(admin, withDiagnostics),
    getSuspendedAccounts(admin, withDiagnostics),
    getNotOnboardedCount(admin, withDiagnostics),
    getNotOnboardedAccounts(admin, withDiagnostics),
    getPaymentsNeedingAttention(admin, withDiagnostics),
    getOverdueQuickStops(admin, { now, ...withDiagnostics }),
    getFailedSmsEvents(admin, withDiagnostics),
    getFailedEmailEvents(admin, withDiagnostics),
    getUnresolvedWebhookFailures(admin, withDiagnostics),
    getRecentIncidents(admin, withDiagnostics),
    getOpenPrivacyRequests(admin, withDiagnostics),
    getCasesNearSla(admin, { now, ...withDiagnostics }),
    getCasesWithoutSlaCount(admin, withDiagnostics),
    getMyAssignedCases(admin, opts.staffEmail, withDiagnostics),
    getCronTrouble(admin, now, () => {
      if (!diagnostics.failed.includes('cronTrouble')) diagnostics.failed.push('cronTrouble');
    }),
  ]);

  const metrics: CommandCenterMetric[] = [
    { key: 'newAccounts', label: 'New accounts', format: 'number', goodDirection: 'up', available: currentWindow.availability.newAccounts && previousWindow.availability.newAccounts, ...computeTrend(currentWindow.newAccounts, previousWindow.newAccounts) },
    { key: 'paymentsProcessed', label: 'Payments processed', format: 'number', goodDirection: 'up', available: currentWindow.availability.paymentsProcessed && previousWindow.availability.paymentsProcessed, ...computeTrend(currentWindow.paymentsProcessed, previousWindow.paymentsProcessed) },
    { key: 'platformFees', label: 'Reconciled LGQ fees', format: 'usd', goodDirection: 'up', available: currentWindow.availability.platformFees && previousWindow.availability.platformFees, ...computeTrend(currentWindow.platformFees, previousWindow.platformFees) },
    { key: 'refunds', label: 'Refunds issued', format: 'usd', goodDirection: 'down', available: currentWindow.availability.refunds && previousWindow.availability.refunds, ...computeTrend(currentWindow.refunds, previousWindow.refunds) },
  ];

  return {
    range, metrics, disputes, pausedPayouts, suspendedAccounts, notOnboardedCount, notOnboardedAccounts,
    dunningPayments, overdueQuickStops, failedSms, failedEmails, webhookFailures, incidents, privacyRequests, casesNearSla,
    casesWithoutSla, myCases, cronTrouble, unavailableSignals: diagnostics.failed,
  };
}
