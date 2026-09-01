import 'server-only';

import { createAdminClient } from '@/lib/auth';
import {
  googleLsaConfigured,
  refreshGoogleTokens,
} from './oauth';

/** A Google Ads customer eligible to supply Local Services facts. */
export type GoogleLsaCandidate = {
  customerId: string;
  customerName: string | null;
  timeZone: string;
  loginCustomerId: string | null;
  campaignId: string | null;
  campaignMode: 'legacy' | 'pmax';
};

type ConnectionRow = {
  account_id: string;
  customer_id: string | null;
  login_customer_id: string | null;
  customer_name: string | null;
  customer_time_zone: string | null;
  campaign_id: string | null;
  campaign_mode: 'legacy' | 'pmax' | null;
  access_token: string;
  refresh_token: string;
  access_expires_at: string;
  candidate_customers: unknown;
  connected_at: string;
  connected_by: string | null;
  last_sync_at: string | null;
  last_full_rescan_at: string | null;
  last_sync_summary: string | null;
  last_error: string | null;
  disconnected_at: string | null;
  sync_started_at?: string | null;
};

export type GoogleLsaConnectionStatus =
  | { state: 'unconfigured' }
  | { state: 'not_connected' }
  | {
      state: 'choose_customer';
      connectedAt: string;
      candidates: GoogleLsaCandidate[];
      reason: string | null;
    }
  | {
      state: 'connected';
      customerId: string;
      customerName: string | null;
      campaignMode: 'legacy' | 'pmax';
      connectedAt: string;
      lastSyncAt: string | null;
      lastSyncSummary: string | null;
    }
  | { state: 'needs_reconnect'; customerName: string | null; reason: string };

export type ActiveGoogleLsaConnection = {
  accountId: string;
  accessToken: string;
  customerId: string;
  loginCustomerId: string | null;
  customerName: string | null;
  customerTimeZone: string;
  campaignId: string | null;
  campaignMode: 'legacy' | 'pmax';
  lastSyncAt: string | null;
  lastFullRescanAt: string | null;
};

const ACCESS_TOKEN_SKEW_MS = 5 * 60 * 1000;

function digits(value: unknown): string | null {
  const normalized = String(value ?? '').replace(/\D/g, '');
  return normalized || null;
}

function candidates(raw: unknown): GoogleLsaCandidate[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const customerId = digits(row.customerId);
    const campaignMode = row.campaignMode === 'pmax' ? 'pmax' : row.campaignMode === 'legacy' ? 'legacy' : null;
    if (!customerId || !campaignMode) return [];
    return [{
      customerId,
      customerName: typeof row.customerName === 'string' ? row.customerName : null,
      timeZone: typeof row.timeZone === 'string' && row.timeZone ? row.timeZone : 'UTC',
      loginCustomerId: digits(row.loginCustomerId),
      campaignId: digits(row.campaignId),
      campaignMode,
    }];
  });
}

async function loadRow(accountId: string): Promise<ConnectionRow | null> {
  try {
    const { data, error } = await createAdminClient()
      .from('google_lsa_connections')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();
    if (error) return null;
    return (data as ConnectionRow | null) ?? null;
  } catch {
    // The integration can deploy before its migration without taking Settings down.
    return null;
  }
}

export async function googleLsaConnectionStatus(accountId: string): Promise<GoogleLsaConnectionStatus> {
  if (!googleLsaConfigured()) return { state: 'unconfigured' };
  const row = await loadRow(accountId);
  if (!row) return { state: 'not_connected' };
  if (row.disconnected_at) {
    return {
      state: 'needs_reconnect',
      customerName: row.customer_name,
      reason: row.last_error || 'Google access needs to be renewed.',
    };
  }
  if (!row.customer_id || !row.campaign_mode) {
    return {
      state: 'choose_customer',
      connectedAt: row.connected_at,
      candidates: candidates(row.candidate_customers),
      reason: row.last_error,
    };
  }
  return {
    state: 'connected',
    customerId: row.customer_id,
    customerName: row.customer_name,
    campaignMode: row.campaign_mode,
    connectedAt: row.connected_at,
    lastSyncAt: row.last_sync_at,
    lastSyncSummary: row.last_sync_summary,
  };
}

export async function saveGoogleLsaAuthorization(input: {
  accountId: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  connectedBy: string | null;
  candidates: GoogleLsaCandidate[];
}): Promise<void> {
  const now = new Date();
  const selected = input.candidates.length === 1 ? input.candidates[0] : null;
  const { error } = await createAdminClient()
    .from('google_lsa_connections')
    .upsert({
      account_id: input.accountId,
      customer_id: selected?.customerId ?? null,
      login_customer_id: selected?.loginCustomerId ?? null,
      customer_name: selected?.customerName ?? null,
      customer_time_zone: selected?.timeZone ?? null,
      campaign_id: selected?.campaignId ?? null,
      campaign_mode: selected?.campaignMode ?? null,
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
      access_expires_at: new Date(now.getTime() + input.accessExpiresIn * 1000).toISOString(),
      candidate_customers: input.candidates,
      connected_at: now.toISOString(),
      connected_by: input.connectedBy,
      disconnected_at: null,
      last_error: input.candidates.length === 0
        ? 'No eligible Local Services campaign was found under this Google login.'
        : null,
      updated_at: now.toISOString(),
    }, { onConflict: 'account_id' });
  if (error) throw new Error(error.message);
}

export async function chooseGoogleLsaCustomer(accountId: string, selection: string): Promise<boolean> {
  const row = await loadRow(accountId);
  if (!row || row.disconnected_at) return false;
  const [rawCustomerId, rawCampaignId] = String(selection ?? '').split(':');
  const normalized = digits(rawCustomerId);
  const campaignId = digits(rawCampaignId);
  const matches = candidates(row.candidate_customers).filter((candidate) => candidate.customerId === normalized);
  const selected = campaignId
    ? matches.find((candidate) => candidate.campaignId === campaignId)
    : matches.length === 1 ? matches[0] : null;
  if (!selected) return false;
  const { error } = await createAdminClient()
    .from('google_lsa_connections')
    .update({
      customer_id: selected.customerId,
      login_customer_id: selected.loginCustomerId,
      customer_name: selected.customerName,
      customer_time_zone: selected.timeZone,
      campaign_id: selected.campaignId,
      campaign_mode: selected.campaignMode,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId);
  if (error) throw new Error(error.message);
  return true;
}

export async function deleteGoogleLsaConnection(accountId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from('google_lsa_connections')
    .delete()
    .eq('account_id', accountId);
  if (error) throw new Error(error.message);
}

export async function markGoogleLsaConnectionError(accountId: string, error: unknown, reconnect = false): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await createAdminClient()
    .from('google_lsa_connections')
    .update({
      last_error: message.slice(0, 500),
      ...(reconnect ? { disconnected_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId);
}

export async function activeGoogleLsaConnection(accountId: string): Promise<ActiveGoogleLsaConnection | null> {
  const row = await loadRow(accountId);
  if (!row || row.disconnected_at || !row.customer_id || !row.campaign_mode) return null;

  let accessToken = row.access_token;
  const expiresAt = new Date(row.access_expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt - ACCESS_TOKEN_SKEW_MS <= Date.now()) {
    try {
      const refreshed = await refreshGoogleTokens(row.refresh_token);
      accessToken = refreshed.accessToken;
      const { error } = await createAdminClient()
        .from('google_lsa_connections')
        .update({
          access_token: refreshed.accessToken,
          refresh_token: refreshed.refreshToken || row.refresh_token,
          access_expires_at: new Date(Date.now() + refreshed.accessExpiresIn * 1000).toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('account_id', accountId);
      if (error) throw new Error(error.message);
    } catch (error) {
      await markGoogleLsaConnectionError(accountId, error, true);
      return null;
    }
  }

  return {
    accountId,
    accessToken,
    customerId: row.customer_id,
    loginCustomerId: row.login_customer_id,
    customerName: row.customer_name,
    customerTimeZone: row.customer_time_zone || 'UTC',
    campaignId: row.campaign_id,
    campaignMode: row.campaign_mode,
    lastSyncAt: row.last_sync_at,
    lastFullRescanAt: row.last_full_rescan_at,
  };
}

export async function claimGoogleLsaSync(accountId: string, staleAfterMinutes = 20): Promise<boolean> {
  const staleAt = new Date(Date.now() - staleAfterMinutes * 60_000).toISOString();
  const { data, error } = await createAdminClient()
    .from('google_lsa_connections')
    .update({ sync_started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .is('disconnected_at', null)
    .or(`sync_started_at.is.null,sync_started_at.lt.${staleAt}`)
    .select('account_id')
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export async function completeGoogleLsaSync(input: {
  accountId: string;
  summary: string;
  fullRescan: boolean;
  error?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  await createAdminClient()
    .from('google_lsa_connections')
    .update({
      sync_started_at: null,
      last_sync_at: now,
      last_sync_summary: input.summary.slice(0, 500),
      last_error: input.error?.slice(0, 500) ?? null,
      ...(input.fullRescan ? { last_full_rescan_at: now } : {}),
      updated_at: now,
    })
    .eq('account_id', input.accountId);
}

export async function listGoogleLsaConnectedAccountIds(): Promise<string[]> {
  const { data, error } = await createAdminClient()
    .from('google_lsa_connections')
    .select('account_id')
    .is('disconnected_at', null)
    .not('customer_id', 'is', null);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => String((row as { account_id: string }).account_id));
}
