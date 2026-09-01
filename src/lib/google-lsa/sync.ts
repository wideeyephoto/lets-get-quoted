import 'server-only';

import { createAdminClient } from '@/lib/auth';
import { createLead } from '@/lib/leads';
import {
  fetchLegacyLsaAccountReport,
  fetchPmaxLsaDailySpend,
  discoverGoogleLsaCustomers,
  listGoogleLsaConversations,
  listGoogleLsaLeads,
} from './api';
import {
  activeGoogleLsaConnection,
  claimGoogleLsaSync,
  completeGoogleLsaSync,
  listGoogleLsaConnectedAccountIds,
  reconcileGoogleLsaCandidates,
} from './connection';
import {
  googleLsaConversationRow,
  googleLsaCrmLeadInput,
  googleLsaLeadRow,
  type RawGoogleLsaConversation,
  type RawGoogleLsaLead,
} from './map';
import type { GoogleLsaConversationRow, GoogleLsaLeadRow } from './types';

const INCREMENTAL_OVERLAP_DAYS = 14;
const FULL_RESCAN_DAYS = 90;
const FULL_RESCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type GoogleLsaSyncSummary = {
  ok: boolean;
  busy: boolean;
  fullRescan: boolean;
  leadsSeen: number;
  leadsLinked: number;
  conversations: number;
  spendRows: number;
  failed: number;
  message: string;
};

function dateKey(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const value = (kind: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === kind)?.value;
    const year = value('year');
    const month = value('month');
    const day = value('day');
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // UTC below is a safe bounded fallback for an invalid stored timezone.
  }
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number, now = Date.now()): Date {
  return new Date(now - days * 24 * 60 * 60 * 1000);
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function nonNegativeInteger(value: unknown): number {
  return Math.max(0, Math.round(numberValue(value)));
}

function dollarsToMicros(value: unknown): number {
  return Math.max(0, Math.round(numberValue(value) * 1_000_000));
}

function providerLeadId(resourceName: string): string | null {
  return /\/localServicesLeads\/([^/]+)$/.exec(resourceName)?.[1] ?? null;
}

function summaryMessage(summary: Omit<GoogleLsaSyncSummary, 'message'>): string {
  const facts = `${summary.leadsSeen} lead${summary.leadsSeen === 1 ? '' : 's'}, ${summary.conversations} conversation${summary.conversations === 1 ? '' : 's'}, ${summary.spendRows} spend row${summary.spendRows === 1 ? '' : 's'}`;
  return summary.failed ? `${facts}; ${summary.failed} import step${summary.failed === 1 ? '' : 's'} failed` : facts;
}

async function upsertSpendRows(rows: Record<string, unknown>[]): Promise<number> {
  if (!rows.length) return 0;
  const { error } = await createAdminClient()
    .from('google_lsa_spend')
    .upsert(rows, {
      onConflict: 'account_id,customer_id,campaign_id,source,period_start,period_end',
    });
  if (error) throw new Error(error.message);
  return rows.length;
}

async function importLeads(input: {
  accountId: string;
  customerId: string;
  customerTimeZone: string;
  rows: GoogleLsaLeadRow[];
}): Promise<{ linked: number; failed: number }> {
  const admin = createAdminClient();
  let linked = 0;
  let failed = 0;

  // Deliberately sequential. createLead also links a unified client record, and
  // an unbounded Promise.all on a first 90-day import can exhaust PostgREST's
  // connection pool for every other request in the workspace.
  for (const lead of input.rows) {
    const raw = lead as RawGoogleLsaLead;
    const provider = googleLsaLeadRow({
      accountId: input.accountId,
      customerId: input.customerId,
      customerTimeZone: input.customerTimeZone,
      lead: raw,
    });
    try {
      const crm = await createLead(
        admin,
        input.accountId,
        googleLsaCrmLeadInput(raw, lead.resourceName, provider.google_created_at),
      );
      const { error } = await admin
        .from('google_lsa_leads')
        .upsert({ ...provider, crm_lead_id: crm.id }, { onConflict: 'account_id,google_lead_id' });
      if (error) throw new Error(error.message);
      linked += 1;
    } catch (error) {
      failed += 1;
      // Keep the provider fact even if CRM projection hit a transient error.
      // The next overlapping poll retries the link without losing charge state.
      await admin
        .from('google_lsa_leads')
        .upsert(provider, { onConflict: 'account_id,google_lead_id' });
      console.error('Google LSA lead projection failed:', error instanceof Error ? error.message : error);
    }
  }
  return { linked, failed };
}

async function importConversations(input: {
  accountId: string;
  customerId: string;
  customerTimeZone: string;
  rows: GoogleLsaConversationRow[];
}): Promise<number> {
  if (!input.rows.length) return 0;
  const admin = createAdminClient();
  const ids = [...new Set(input.rows.map((row) => providerLeadId(row.leadResourceName)).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return 0;
  const { data: known, error: knownError } = await admin
    .from('google_lsa_leads')
    .select('google_lead_id')
    .eq('account_id', input.accountId)
    .eq('customer_id', input.customerId)
    .in('google_lead_id', ids);
  if (knownError) throw new Error(knownError.message);
  const knownIds = new Set((known ?? []).map((row) => String((row as { google_lead_id: string }).google_lead_id)));
  const rows = input.rows.flatMap((conversation) => {
    const leadId = providerLeadId(conversation.leadResourceName);
    if (!leadId || !knownIds.has(leadId)) return [];
    return [googleLsaConversationRow({
      accountId: input.accountId,
      customerId: input.customerId,
      customerTimeZone: input.customerTimeZone,
      conversation: conversation as RawGoogleLsaConversation,
    })];
  });
  if (!rows.length) return 0;
  const { error } = await admin
    .from('google_lsa_conversations')
    .upsert(rows, { onConflict: 'account_id,google_conversation_id' });
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function syncGoogleLsaAccount(accountId: string): Promise<GoogleLsaSyncSummary> {
  const claimed = await claimGoogleLsaSync(accountId);
  if (!claimed) {
    return {
      ok: false, busy: true, fullRescan: false, leadsSeen: 0, leadsLinked: 0,
      conversations: 0, spendRows: 0, failed: 0,
      message: 'Another Google Local Services import is already running.',
    };
  }

  let connection;
  try {
    connection = await activeGoogleLsaConnection(accountId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Google access is temporarily unavailable.';
    const message = `Google Local Services import could not refresh access: ${detail}`;
    await completeGoogleLsaSync({ accountId, summary: message, fullRescan: false, error: message });
    return {
      ok: false, busy: false, fullRescan: false, leadsSeen: 0, leadsLinked: 0,
      conversations: 0, spendRows: 0, failed: 1, message,
    };
  }
  if (!connection) {
    const result = {
      ok: false, busy: false, fullRescan: false, leadsSeen: 0, leadsLinked: 0,
      conversations: 0, spendRows: 0, failed: 1,
    };
    const message = 'Google access needs to be renewed before data can be imported.';
    await completeGoogleLsaSync({ accountId, summary: message, fullRescan: false, error: message });
    return { ...result, message };
  }

  const now = Date.now();
  const lastFull = connection.lastFullRescanAt ? new Date(connection.lastFullRescanAt).getTime() : NaN;
  const fullRescan = !Number.isFinite(lastFull) || now - lastFull >= FULL_RESCAN_INTERVAL_MS;
  if (fullRescan) {
    try {
      const discovered = await discoverGoogleLsaCustomers({ accessToken: connection.accessToken });
      const selected = await reconcileGoogleLsaCandidates(accountId, discovered.map((candidate) => ({
        customerId: candidate.customerId,
        customerName: candidate.descriptiveName,
        timeZone: candidate.timeZone,
        loginCustomerId: candidate.loginCustomerId,
        campaignId: candidate.campaign.id,
        campaignMode: candidate.campaignKind,
      })));
      if (selected) {
        connection = {
          ...connection,
          customerName: selected.customerName,
          customerTimeZone: selected.timeZone,
          loginCustomerId: selected.loginCustomerId,
          campaignId: selected.campaignId,
          campaignMode: selected.campaignMode,
        };
      }
    } catch (error) {
      // Existing imports remain useful when discovery has a transient outage.
      // The daily pass will retry migration reconciliation on its next run.
      console.error('Google LSA campaign reconciliation failed:', error instanceof Error ? error.message : error);
    }
  }
  const startDate = dateKey(daysAgo(fullRescan ? FULL_RESCAN_DAYS - 1 : INCREMENTAL_OVERLAP_DAYS, now), connection.customerTimeZone);
  const endDate = dateKey(new Date(now), connection.customerTimeZone);
  let leadsSeen = 0;
  let leadsLinked = 0;
  let conversations = 0;
  let spendRows = 0;
  let failed = 0;
  const errors: string[] = [];
  const auth = {
    accessToken: connection.accessToken,
    customerId: connection.customerId,
    loginCustomerId: connection.loginCustomerId,
  };

  try {
    const leads = await listGoogleLsaLeads({ ...auth, startDate, endDate });
    leadsSeen = leads.length;
    const result = await importLeads({
      accountId,
      customerId: connection.customerId,
      customerTimeZone: connection.customerTimeZone,
      rows: leads,
    });
    leadsLinked = result.linked;
    failed += result.failed;
    if (result.failed) errors.push(`${result.failed} lead projection${result.failed === 1 ? '' : 's'} failed`);
  } catch (error) {
    failed += 1;
    errors.push(error instanceof Error ? error.message : 'Lead import failed.');
  }

  try {
    const rows = await listGoogleLsaConversations({ ...auth, startDate, endDate });
    conversations = await importConversations({
      accountId,
      customerId: connection.customerId,
      customerTimeZone: connection.customerTimeZone,
      rows,
    });
  } catch (error) {
    failed += 1;
    errors.push(error instanceof Error ? error.message : 'Conversation import failed.');
  }

  try {
    if (connection.campaignMode === 'pmax') {
      const rows = await fetchPmaxLsaDailySpend({
        ...auth,
        startDate,
        endDate,
        campaignId: connection.campaignId ?? undefined,
      });
      spendRows = await upsertSpendRows(rows.map((row) => ({
        account_id: accountId,
        customer_id: connection.customerId,
        campaign_id: row.campaignId,
        source: 'google_ads_api',
        period_start: row.date,
        period_end: row.date,
        gross_cost_micros: nonNegativeInteger(row.costMicros),
        charged_leads: 0,
        phone_calls: 0,
        connected_phone_calls: 0,
        currency_code: row.currencyCode || 'USD',
        captured_at: new Date().toISOString(),
      })));
    } else {
      // Legacy Local Services reports only aggregate spend, so every row is a
      // 90-day snapshot. Reporting selects the newest matching snapshot rather
      // than summing overlapping windows.
      const reportStart = dateKey(daysAgo(FULL_RESCAN_DAYS - 1, now), connection.customerTimeZone);
      if (!connection.loginCustomerId) {
        throw new Error('Legacy Local Services cost reporting requires an accessible Google Ads manager account. Reconnect through the manager account to import spend.');
      }
      const reports = await fetchLegacyLsaAccountReport({
        accessToken: connection.accessToken,
        managerCustomerId: connection.loginCustomerId,
        customerId: connection.customerId,
        startDate: reportStart,
        endDate,
      });
      const report = reports.find((row) => String(row.accountId).replace(/\D/g, '') === connection.customerId) ?? reports[0];
      if (report) {
        spendRows = await upsertSpendRows([{
          account_id: accountId,
          customer_id: connection.customerId,
          campaign_id: connection.campaignId,
          source: 'local_services_account_report',
          period_start: reportStart,
          period_end: endDate,
          gross_cost_micros: dollarsToMicros(report.currentPeriodTotalCost),
          charged_leads: nonNegativeInteger(report.currentPeriodChargedLeads),
          phone_calls: nonNegativeInteger(report.currentPeriodPhoneCalls),
          connected_phone_calls: nonNegativeInteger(report.currentPeriodConnectedPhoneCalls),
          currency_code: String(report.currencyCode || 'USD').toUpperCase().slice(0, 3),
          captured_at: new Date().toISOString(),
        }]);
      }
    }
  } catch (error) {
    failed += 1;
    errors.push(error instanceof Error ? error.message : 'Spend import failed.');
  }

  const base = {
    ok: failed === 0,
    busy: false,
    fullRescan,
    leadsSeen,
    leadsLinked,
    conversations,
    spendRows,
    failed,
  };
  const message = summaryMessage(base);
  await completeGoogleLsaSync({
    accountId,
    summary: message,
    fullRescan: fullRescan && failed === 0,
    error: errors.length ? errors.join('; ').slice(0, 500) : null,
  });
  return { ...base, message };
}

export async function syncAllGoogleLsaAccounts(): Promise<{
  processed: number;
  succeeded: number;
  busy: number;
  failed: number;
  leads: number;
  conversations: number;
}> {
  const accountIds = await listGoogleLsaConnectedAccountIds();
  const totals = { processed: accountIds.length, succeeded: 0, busy: 0, failed: 0, leads: 0, conversations: 0 };
  for (const accountId of accountIds) {
    try {
      const result = await syncGoogleLsaAccount(accountId);
      totals.leads += result.leadsLinked;
      totals.conversations += result.conversations;
      if (result.busy) totals.busy += 1;
      else if (result.ok) totals.succeeded += 1;
      else totals.failed += 1;
    } catch (error) {
      totals.failed += 1;
      console.error('Google LSA account sync failed:', error instanceof Error ? error.message : error);
    }
  }
  return totals;
}
