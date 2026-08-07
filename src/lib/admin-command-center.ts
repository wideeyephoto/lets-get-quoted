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
  getMyAssignedCases,
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
} from '@/lib/admin-alerts';
import { rangeWindow, computeTrend, type DateRange } from '@/lib/command-center-logic';

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
  casesNearSla: SupportCaseRow[];
  myCases: SupportCaseRow[];
};

type MetricsWindow = { newAccounts: number; paymentsProcessed: number; platformFees: number; refunds: number };

// One window's worth of the "core metrics" row. Never throws — a Postgres
// error surfaces via `.error` on each response, not an exception, so this
// degrades to zeros exactly like every fetcher in admin-alerts.ts rather than
// needing its own try/catch.
async function fetchMetricsWindow(admin: SupabaseClient, startIso: string, endIso: string): Promise<MetricsWindow> {
  const [accountsRes, paidRes, refundRes] = await Promise.all([
    admin.from('accounts').select('id', { count: 'exact', head: true }).gte('created_at', startIso).lt('created_at', endIso),
    admin.from('payments').select('platform_fee').eq('status', 'paid').gte('paid_at', startIso).lt('paid_at', endIso),
    admin.from('payments').select('refunded_amount').gt('refunded_amount', 0).gte('paid_at', startIso).lt('paid_at', endIso),
  ]);
  if (accountsRes.error) console.error('command center metrics (new accounts) failed:', accountsRes.error);
  if (paidRes.error) console.error('command center metrics (payments) failed:', paidRes.error);
  if (refundRes.error) console.error('command center metrics (refunds) failed:', refundRes.error);

  const paidRows = (paidRes.data ?? []) as { platform_fee: number | null }[];
  const refundRows = (refundRes.data ?? []) as { refunded_amount: number | null }[];
  return {
    newAccounts: accountsRes.count ?? 0,
    paymentsProcessed: paidRows.length,
    platformFees: paidRows.reduce((s, r) => s + (Number(r.platform_fee) || 0), 0),
    refunds: refundRows.reduce((s, r) => s + (Number(r.refunded_amount) || 0), 0),
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
    casesNearSla,
    myCases,
  ] = await Promise.all([
    fetchMetricsWindow(admin, win.currentStart, win.currentEnd),
    fetchMetricsWindow(admin, win.previousStart, win.previousEnd),
    getOpenDisputes(admin),
    getPausedPayouts(admin),
    getSuspendedAccounts(admin),
    getNotOnboardedCount(admin),
    getNotOnboardedAccounts(admin),
    getPaymentsNeedingAttention(admin),
    getOverdueQuickStops(admin),
    getFailedSmsEvents(admin),
    getFailedEmailEvents(admin),
    getUnresolvedWebhookFailures(admin),
    getRecentIncidents(admin),
    getCasesNearSla(admin),
    getMyAssignedCases(admin, opts.staffEmail),
  ]);

  const metrics: CommandCenterMetric[] = [
    { key: 'newAccounts', label: 'New accounts', format: 'number', goodDirection: 'up', ...computeTrend(currentWindow.newAccounts, previousWindow.newAccounts) },
    { key: 'paymentsProcessed', label: 'Payments processed', format: 'number', goodDirection: 'up', ...computeTrend(currentWindow.paymentsProcessed, previousWindow.paymentsProcessed) },
    { key: 'platformFees', label: 'Platform fees', format: 'usd', goodDirection: 'up', ...computeTrend(currentWindow.platformFees, previousWindow.platformFees) },
    { key: 'refunds', label: 'Refunds issued', format: 'usd', goodDirection: 'down', ...computeTrend(currentWindow.refunds, previousWindow.refunds) },
  ];

  return {
    range, metrics, disputes, pausedPayouts, suspendedAccounts, notOnboardedCount, notOnboardedAccounts,
    dunningPayments, overdueQuickStops, failedSms, failedEmails, webhookFailures, incidents, casesNearSla, myCases,
  };
}
