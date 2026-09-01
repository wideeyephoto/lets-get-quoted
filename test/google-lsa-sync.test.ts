import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');
const sync = source('src/lib/google-lsa/sync.ts');
const connection = source('src/lib/google-lsa/connection.ts');
const disconnectRoute = source('src/app/api/google-lsa/disconnect/route.ts');

describe('Google Local Services synchronization contract', () => {
  it('polls overlapping provider windows and projects every lead through the replay-safe CRM identity', () => {
    expect(sync).toContain('const INCREMENTAL_OVERLAP_DAYS = 14');
    expect(sync).toContain('const FULL_RESCAN_DAYS = 90');
    expect(sync).toContain('shiftGoogleCalendarDate(endDate, -(windowDays - 1))');
    expect(sync).toContain('shiftGoogleCalendarDate(endDate, -(FULL_RESCAN_DAYS - 1))');
    expect(sync).not.toContain('days * 24 * 60 * 60 * 1000');
    expect(sync).toContain('listGoogleLsaLeads({ ...auth, startDate, endDate })');
    expect(sync).toContain('listGoogleLsaConversations({ ...auth, startDate, endDate })');
    expect(sync).toContain('googleLsaCrmLeadInput(raw, lead.resourceName, provider.google_created_at)');
    expect(sync).toContain("onConflict: 'account_id,customer_id,google_lead_id'");
    expect(sync).toContain("onConflict: 'account_id,customer_id,google_conversation_id'");
    expect(sync).toContain('const batchSize = 200');
    expect(sync).toContain("ids.slice(offset, offset + batchSize)");
    expect(sync).toContain('rows.slice(offset, offset + batchSize)');
  });

  it('keeps LSA spend in the provider ledger and never sends it through managed-ads billing', () => {
    expect(sync).toContain(".from('google_lsa_spend')");
    expect(sync).toContain("source: 'google_ads_api'");
    expect(sync).toContain("source: 'local_services_account_report'");
    expect(sync).not.toMatch(/ad_wallet|wallet|managed_ads|stripe/i);
  });

  it('rediscovers campaigns daily so a legacy account cuts over to migrated PMax cost rows', () => {
    expect(sync).toContain('discoverGoogleLsaCustomers({ accessToken: connection.accessToken })');
    expect(sync).toContain('reconcileGoogleLsaCandidates');
    expect(connection).toContain('campaign_mode: selected.campaignMode');
    expect(connection).toContain('login_customer_id: selected.loginCustomerId');
  });

  it('requires a real manager path for legacy aggregate cost reporting', () => {
    expect(sync).toContain('if (!connection.loginCustomerId)');
    expect(sync).toContain('managerCustomerId: connection.loginCustomerId');
    expect(sync).toContain('customerId: connection.customerId');
    expect(sync).not.toContain('connection.loginCustomerId || connection.customerId');
    expect(sync).not.toContain('?? reports[0]');
    expect(sync).toContain('if (!report)');
  });

  it('disconnects only when Google reports a terminal OAuth grant failure', () => {
    expect(connection).toContain('googleOAuthRequiresReconnect(error)');
    expect(connection).toContain('markGoogleLsaConnectionError(accountId, error, reconnect, row.refresh_token)');
    expect(connection).toContain('if (reconnect) return null');
    expect(connection).toContain('throw error');
    expect(connection).not.toContain('markGoogleLsaConnectionError(accountId, error, true)');
  });

  it('never reports a disconnect when the local credential could not be removed', () => {
    expect(disconnectRoute).toContain('await disconnectGoogleLsaConnection(accountId)');
    expect(disconnectRoute).toContain("google_lsa=disconnect-failed");
    expect(disconnectRoute).toContain("revokeConfirmed ? 'disconnected' : 'disconnected-local'");
    expect(disconnectRoute).not.toContain('disconnectGoogleLsaConnection(accountId).catch');
    expect(connection).toContain("access_token: ''");
    expect(connection).toContain("refresh_token: ''");
    expect(connection).toContain('disconnected_at: now');
  });

  it('uses a bounded oldest-first account batch so later tenants cannot starve', () => {
    expect(connection).toContain(".order('last_sync_attempt_at', { ascending: true, nullsFirst: true })");
    expect(connection).toContain(".order('account_id', { ascending: true })");
    expect(connection).toContain('.limit(Math.max(1, Math.min(50, Math.trunc(limit))))');
  });
});
