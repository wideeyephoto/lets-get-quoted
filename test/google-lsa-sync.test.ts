import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');
const sync = source('src/lib/google-lsa/sync.ts');
const connection = source('src/lib/google-lsa/connection.ts');

describe('Google Local Services synchronization contract', () => {
  it('polls overlapping provider windows and projects every lead through the replay-safe CRM identity', () => {
    expect(sync).toContain('const INCREMENTAL_OVERLAP_DAYS = 14');
    expect(sync).toContain('const FULL_RESCAN_DAYS = 90');
    expect(sync).toContain('listGoogleLsaLeads({ ...auth, startDate, endDate })');
    expect(sync).toContain('listGoogleLsaConversations({ ...auth, startDate, endDate })');
    expect(sync).toContain('googleLsaCrmLeadInput(raw, lead.resourceName, provider.google_created_at)');
    expect(sync).toContain("onConflict: 'account_id,google_lead_id'");
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
  });

  it('disconnects only when Google reports a terminal OAuth grant failure', () => {
    expect(connection).toContain('googleOAuthRequiresReconnect(error)');
    expect(connection).toContain('markGoogleLsaConnectionError(accountId, error, reconnect)');
    expect(connection).toContain('if (reconnect) return null');
    expect(connection).toContain('throw error');
    expect(connection).not.toContain('markGoogleLsaConnectionError(accountId, error, true)');
  });
});
