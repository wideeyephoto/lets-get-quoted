import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { googleLocalDateTimeToIso } from './map';

export const GOOGLE_LSA_REPORTING_WINDOW_DAYS = 90;

export const GOOGLE_LSA_ATTRIBUTION_CAVEAT =
  'Google does not provide a dollar cost or credit amount for each LSA lead. ROAS therefore compares account-level spend with mapped CRM jobs that have a recorded quote signature. Credits are a count only, and booking totals identify booking leads rather than appointment details.';

export type GoogleLsaConnectionState = 'not_connected' | 'connected' | 'needs_attention' | 'disconnected';
export type GoogleLsaSpendSource = 'google_ads_api' | 'local_services_account_report' | null;

export type GoogleLsaReportingSummary = {
  windowDays: number;
  periodStart: string;
  periodEnd: string;
  connectionState: GoogleLsaConnectionState;
  customerId: string | null;
  customerName: string | null;
  campaignMode: 'legacy' | 'pmax' | null;
  lastSyncAt: string | null;
  spendSource: GoogleLsaSpendSource;
  costMicros: number;
  costDollars: number;
  currencyCode: string | null;
  leadCount: number;
  callCount: number;
  bookingCount: number;
  creditCount: number;
  feedbackCount: number;
  signedJobCount: number;
  signedRevenueDollars: number;
  roas: number | null;
  attributionCaveat: string;
};

type ConnectionRow = {
  account_id?: unknown;
  customer_id?: unknown;
  customer_name?: unknown;
  customer_time_zone?: unknown;
  campaign_id?: unknown;
  campaign_mode?: unknown;
  last_sync_at?: unknown;
  last_error?: unknown;
  disconnected_at?: unknown;
};

type SignedJobRow = {
  id?: unknown;
  quoted_amount?: unknown;
  quote_signed_at?: unknown;
};

type CrmLeadRow = {
  converted_job?: unknown;
  signed_job?: SignedJobRow | SignedJobRow[] | null;
};

type LsaLeadRow = {
  id?: unknown;
  customer_id?: unknown;
  google_lead_id?: unknown;
  resource_name?: unknown;
  crm_lead_id?: unknown;
  lead_type?: unknown;
  credit_state?: unknown;
  feedback_submitted?: unknown;
  google_created_at?: unknown;
  crm_lead?: CrmLeadRow | CrmLeadRow[] | null;
};

type SpendRow = {
  id?: unknown;
  customer_id?: unknown;
  campaign_id?: unknown;
  source?: unknown;
  period_start?: unknown;
  period_end?: unknown;
  gross_cost_micros?: unknown;
  phone_calls?: unknown;
  connected_phone_calls?: unknown;
  currency_code?: unknown;
  captured_at?: unknown;
};

export type GoogleLsaReportingRows = {
  connection: ConnectionRow | null;
  leads: LsaLeadRow[];
  spend: SpendRow[];
};

type QueryError = { message?: string } | null;

const CREDIT_ISSUED_STATES = new Set([
  'CREDITED',
  'CREDIT_ISSUED',
  'CREDIT_STATE_CREDITED',
  'ISSUED',
]);

const LSA_LEAD_REPORT_SELECT = `
  id,
  customer_id,
  google_lead_id,
  resource_name,
  crm_lead_id,
  lead_type,
  credit_state,
  feedback_submitted,
  google_created_at,
  crm_lead:leads!google_lsa_leads_crm_lead_id_fkey(
    converted_job,
    signed_job:jobs!leads_converted_job_fkey(
      id,
      quoted_amount,
      quote_signed_at
    )
  )
`;

function utcDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function localDateKey(now: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const value = (kind: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === kind)?.value;
    const year = value('year');
    const month = value('month');
    const day = value('day');
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // A damaged stored timezone must not take the whole performance page down.
  }
  return utcDateKey(now);
}

function shiftDateKey(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  return utcDateKey(new Date(Date.UTC(year, month - 1, day + days)));
}

export function googleLsaRollingWindow(now = new Date(), timeZone = 'UTC'): {
  periodStart: string;
  periodEnd: string;
  startsAt: string;
  endsAt: string;
} {
  const periodEnd = localDateKey(now, timeZone);
  const periodStart = shiftDateKey(periodEnd, -(GOOGLE_LSA_REPORTING_WINDOW_DAYS - 1));
  const nextDay = shiftDateKey(periodEnd, 1);
  const startsAt = googleLocalDateTimeToIso(`${periodStart} 00:00:00`, timeZone)
    ?? `${periodStart}T00:00:00.000Z`;
  const nextDayStartsAt = googleLocalDateTimeToIso(`${nextDay} 00:00:00`, timeZone)
    ?? `${nextDay}T00:00:00.000Z`;

  return {
    periodStart,
    periodEnd,
    startsAt,
    endsAt: new Date(new Date(nextDayStartsAt).getTime() - 1).toISOString(),
  };
}

function textValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function enumValue(value: unknown): string {
  return (textValue(value) ?? '')
    .toUpperCase()
    .replace(/[\s.-]+/g, '_');
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function nonNegativeInteger(value: unknown): number {
  return Math.max(0, Math.trunc(numberValue(value)));
}

function persistedBoolean(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  return ['TRUE', 'T', 'YES', 'Y', '1'].includes(value.trim().toUpperCase());
}

export function isIssuedGoogleLsaCreditState(value: unknown): boolean {
  return CREDIT_ISSUED_STATES.has(enumValue(value));
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function timestamp(value: unknown): number {
  const parsed = Date.parse(textValue(value) ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function newest<T extends { captured_at?: unknown }>(left: T | null, right: T): T {
  if (!left) return right;
  return timestamp(right.captured_at) >= timestamp(left.captured_at) ? right : left;
}

function matchesCustomer(rowCustomerId: unknown, customerId: string | null): boolean {
  return !customerId || textValue(rowCustomerId) === customerId;
}

function connectionState(connection: ConnectionRow | null): GoogleLsaConnectionState {
  if (!connection) return 'not_connected';
  if (textValue(connection.disconnected_at)) return 'disconnected';
  if (textValue(connection.last_error)) return 'needs_attention';
  return 'connected';
}

function normalizedCampaignMode(value: unknown): 'legacy' | 'pmax' | null {
  const mode = enumValue(value).toLowerCase();
  return mode === 'legacy' || mode === 'pmax' ? mode : null;
}

function distinctLeads(
  rows: LsaLeadRow[],
  customerId: string | null,
  startsAt: string,
  endsAt: string,
): LsaLeadRow[] {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  const byProviderIdentity = new Map<string, LsaLeadRow>();

  for (const row of rows) {
    if (!matchesCustomer(row.customer_id, customerId)) continue;
    const createdAt = timestamp(row.google_created_at);
    if (!createdAt || createdAt < start || createdAt > end) continue;

    const identity = textValue(row.google_lead_id) ?? textValue(row.resource_name) ?? textValue(row.id);
    if (!identity || byProviderIdentity.has(identity)) continue;
    byProviderIdentity.set(identity, row);
  }

  return [...byProviderIdentity.values()];
}

function selectedGoogleAdsDailyRows(
  rows: SpendRow[],
  connection: ConnectionRow | null,
  periodStart: string,
  periodEnd: string,
): SpendRow[] {
  const customerId = textValue(connection?.customer_id);
  const configuredCampaignId = textValue(connection?.campaign_id);
  const exactRows = new Map<string, SpendRow>();

  for (const row of rows) {
    if (enumValue(row.source).toLowerCase() !== 'google_ads_api') continue;
    if (!matchesCustomer(row.customer_id, customerId)) continue;

    const start = textValue(row.period_start);
    const end = textValue(row.period_end);
    if (!start || start !== end || start < periodStart || start > periodEnd) continue;

    const campaignId = textValue(row.campaign_id);
    if (configuredCampaignId && campaignId !== configuredCampaignId) continue;

    const identity = [textValue(row.customer_id) ?? '', campaignId ?? '', start, end].join('|');
    exactRows.set(identity, newest(exactRows.get(identity) ?? null, row));
  }

  if (configuredCampaignId) return [...exactRows.values()];

  // A campaign-less row is an account/day total. If it exists, adding its
  // campaign rows would count the same dollars twice. Otherwise each distinct
  // campaign/day row is non-overlapping and may be summed.
  const byCustomerDay = new Map<string, SpendRow[]>();
  for (const row of exactRows.values()) {
    const key = [textValue(row.customer_id) ?? '', textValue(row.period_start) ?? ''].join('|');
    const group = byCustomerDay.get(key) ?? [];
    group.push(row);
    byCustomerDay.set(key, group);
  }

  return [...byCustomerDay.values()].flatMap((group) => {
    const accountTotal = group.filter((row) => !textValue(row.campaign_id)).reduce<SpendRow | null>(newest, null);
    return accountTotal ? [accountTotal] : group;
  });
}

function latestLegacySnapshot(
  rows: SpendRow[],
  customerId: string | null,
  periodStart: string,
  periodEnd: string,
): SpendRow | null {
  let latest: SpendRow | null = null;
  for (const row of rows) {
    if (enumValue(row.source).toLowerCase() !== 'local_services_account_report') continue;
    if (!matchesCustomer(row.customer_id, customerId)) continue;
    if (textValue(row.period_start) !== periodStart || textValue(row.period_end) !== periodEnd) continue;
    latest = newest(latest, row);
  }
  return latest;
}

function selectedSpendRows(
  rows: SpendRow[],
  connection: ConnectionRow | null,
  periodStart: string,
  periodEnd: string,
): { source: GoogleLsaSpendSource; rows: SpendRow[] } {
  const campaignMode = normalizedCampaignMode(connection?.campaign_mode);
  const googleRows = selectedGoogleAdsDailyRows(rows, connection, periodStart, periodEnd);
  const legacyRow = latestLegacySnapshot(rows, textValue(connection?.customer_id), periodStart, periodEnd);

  if (campaignMode === 'pmax') return { source: googleRows.length > 0 ? 'google_ads_api' : null, rows: googleRows };
  if (campaignMode === 'legacy') {
    return { source: legacyRow ? 'local_services_account_report' : null, rows: legacyRow ? [legacyRow] : [] };
  }
  if (googleRows.length > 0) return { source: 'google_ads_api', rows: googleRows };
  return { source: legacyRow ? 'local_services_account_report' : null, rows: legacyRow ? [legacyRow] : [] };
}

function currencyCode(rows: SpendRow[]): string | null {
  const codes = new Set(rows.map((row) => enumValue(row.currency_code)).filter(Boolean));
  return codes.size === 1 ? [...codes][0] : null;
}

export function summarizeGoogleLsaRows(
  rows: GoogleLsaReportingRows,
  now = new Date(),
): GoogleLsaReportingSummary {
  const window = googleLsaRollingWindow(now, textValue(rows.connection?.customer_time_zone) ?? 'UTC');
  const customerId = textValue(rows.connection?.customer_id);
  const leads = distinctLeads(rows.leads, customerId, window.startsAt, window.endsAt);
  const spend = selectedSpendRows(rows.spend, rows.connection, window.periodStart, window.periodEnd);
  const signedJobs = new Map<string, number>();

  let phoneLeadCount = 0;
  let bookingCount = 0;
  let creditCount = 0;
  let feedbackCount = 0;

  for (const lead of leads) {
    const leadType = enumValue(lead.lead_type);
    if (leadType === 'PHONE_CALL') phoneLeadCount += 1;
    if (leadType === 'BOOKING') bookingCount += 1;
    if (isIssuedGoogleLsaCreditState(lead.credit_state)) creditCount += 1;
    if (persistedBoolean(lead.feedback_submitted)) feedbackCount += 1;

    const crmLead = one(lead.crm_lead);
    const job = one(crmLead?.signed_job);
    const jobId = textValue(job?.id) ?? textValue(crmLead?.converted_job);
    if (!jobId || !textValue(job?.quote_signed_at) || signedJobs.has(jobId)) continue;
    signedJobs.set(jobId, Math.max(0, numberValue(job?.quoted_amount)));
  }

  const costMicros = spend.rows.reduce((total, row) => total + nonNegativeInteger(row.gross_cost_micros), 0);
  const costDollars = costMicros / 1_000_000;
  const providerPhoneCalls = spend.rows.reduce((total, row) => total + nonNegativeInteger(row.phone_calls), 0);
  const providerConnectedCalls = spend.rows.reduce((total, row) => total + nonNegativeInteger(row.connected_phone_calls), 0);
  const providerCallCount = Math.max(providerPhoneCalls, providerConnectedCalls);
  const signedRevenueDollars = [...signedJobs.values()].reduce((total, amount) => total + amount, 0);

  return {
    windowDays: GOOGLE_LSA_REPORTING_WINDOW_DAYS,
    periodStart: window.periodStart,
    periodEnd: window.periodEnd,
    connectionState: connectionState(rows.connection),
    customerId,
    customerName: textValue(rows.connection?.customer_name),
    campaignMode: normalizedCampaignMode(rows.connection?.campaign_mode),
    lastSyncAt: textValue(rows.connection?.last_sync_at),
    spendSource: spend.source,
    costMicros,
    costDollars,
    currencyCode: currencyCode(spend.rows),
    leadCount: leads.length,
    // The provider aggregate and imported phone-call leads describe the same
    // calls at different levels. Taking the larger complete fact avoids adding
    // them together while still covering lag in either import.
    callCount: Math.max(phoneLeadCount, providerCallCount),
    bookingCount,
    creditCount,
    feedbackCount,
    signedJobCount: signedJobs.size,
    signedRevenueDollars,
    roas: costDollars > 0 ? signedRevenueDollars / costDollars : null,
    attributionCaveat: GOOGLE_LSA_ATTRIBUTION_CAVEAT,
  };
}

function queryFailure(label: string, error: QueryError): Error {
  return new Error(`Unable to load Google LSA ${label}: ${error?.message ?? 'unknown database error'}`);
}

/**
 * Reads a tenant-scoped, rolling 90-day LSA summary without constructing or
 * assuming a particular Supabase client. The current dark-table grants require
 * callers to pass a service-role client after they authorize the account; the
 * injected dependency also keeps this aggregation independently testable.
 */
export async function getGoogleLsaReportingSummary(
  supabase: SupabaseClient,
  accountId: string,
  options: { now?: Date } = {},
): Promise<GoogleLsaReportingSummary> {
  const connectionResult = await supabase
    .from('google_lsa_connections')
    .select('account_id, customer_id, customer_name, customer_time_zone, campaign_id, campaign_mode, last_sync_at, last_error, disconnected_at')
    .eq('account_id', accountId)
    .maybeSingle();
  if (connectionResult.error) throw queryFailure('connection', connectionResult.error);
  const connection = (connectionResult.data as ConnectionRow | null) ?? null;
  const window = googleLsaRollingWindow(options.now, textValue(connection?.customer_time_zone) ?? 'UTC');

  const [leadsResult, spendResult] = await Promise.all([
    supabase
      .from('google_lsa_leads')
      .select(LSA_LEAD_REPORT_SELECT)
      .eq('account_id', accountId)
      .gte('google_created_at', window.startsAt)
      .lte('google_created_at', window.endsAt),
    supabase
      .from('google_lsa_spend')
      .select('id, customer_id, campaign_id, source, period_start, period_end, gross_cost_micros, phone_calls, connected_phone_calls, currency_code, captured_at')
      .eq('account_id', accountId)
      .gte('period_end', window.periodStart)
      .lte('period_start', window.periodEnd),
  ]);

  if (leadsResult.error) throw queryFailure('leads', leadsResult.error);
  if (spendResult.error) throw queryFailure('spend', spendResult.error);

  return summarizeGoogleLsaRows(
    {
      connection,
      leads: (leadsResult.data as unknown as LsaLeadRow[] | null) ?? [],
      spend: (spendResult.data as SpendRow[] | null) ?? [],
    },
    options.now,
  );
}
