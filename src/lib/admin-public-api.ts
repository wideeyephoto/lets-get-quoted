import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminApiCredential = Readonly<{
  id: string;
  accountId: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  createdBy: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}>;

export type AdminApiRequestLog = Readonly<{
  id: string;
  credentialId: string;
  accountId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTimeMs: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  errorCode: string | null;
  createdAt: string;
}>;

export type AdminWebhookSubscription = Readonly<{
  id: string;
  accountId: string;
  targetUrl: string;
  subscribedEvents: string[];
  status: string;
  failureCount: number;
  disabledAt: string | null;
  createdAt: string;
}>;

export type AdminWebhookDeliveryFailure = Readonly<{
  id: string;
  subscriptionId: string;
  accountId: string;
  businessName?: string | null;
  eventId: string;
  targetUrl: string;
  attemptCount: number;
  status: string; // 'failed' | 'dead_letter'
  lastStatusCode: number | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type AdminAccountApiSurface = Readonly<{
  credentials: readonly AdminApiCredential[];
  recentRequests: readonly AdminApiRequestLog[];
  subscriptions: readonly AdminWebhookSubscription[];
  recentDeliveries: readonly AdminWebhookDeliveryFailure[];
}>;

/**
 * Loads API tokens, request logs, and webhook subscriptions for an account.
 */
export async function loadAccountApiSurface(
  admin: SupabaseClient,
  accountId: string,
): Promise<AdminAccountApiSurface> {
  const [credsRes, reqsRes, subsRes, delsRes] = await Promise.all([
    admin
      .from('api_credentials')
      .select('id, account_id, name, token_prefix, scopes, expires_at, revoked_at, created_by, last_used_at, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(50),
    admin
      .from('api_request_audit')
      .select('id, credential_id, account_id, endpoint, method, status_code, response_time_ms, ip_address, user_agent, error_code, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(50),
    admin
      .from('webhook_subscriptions')
      .select('id, account_id, target_url, subscribed_events, status, failure_count, disabled_at, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(20),
    admin
      .from('webhook_deliveries')
      .select('id, subscription_id, account_id, event_id, target_url, attempt_count, status, last_status_code, last_error_code, last_error_message, next_retry_at, created_at, updated_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  const credentials: AdminApiCredential[] = (credsRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    accountId: String(r.account_id),
    name: String(r.name),
    tokenPrefix: String(r.token_prefix),
    scopes: Array.isArray(r.scopes) ? (r.scopes as string[]) : [],
    expiresAt: r.expires_at ? String(r.expires_at) : null,
    revokedAt: r.revoked_at ? String(r.revoked_at) : null,
    createdBy: r.created_by ? String(r.created_by) : null,
    lastUsedAt: r.last_used_at ? String(r.last_used_at) : null,
    createdAt: String(r.created_at),
  }));

  const recentRequests: AdminApiRequestLog[] = (reqsRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    credentialId: String(r.credential_id),
    accountId: String(r.account_id),
    endpoint: String(r.endpoint),
    method: String(r.method),
    statusCode: Number(r.status_code),
    responseTimeMs: r.response_time_ms !== null ? Number(r.response_time_ms) : null,
    ipAddress: r.ip_address ? String(r.ip_address) : null,
    userAgent: r.user_agent ? String(r.user_agent) : null,
    errorCode: r.error_code ? String(r.error_code) : null,
    createdAt: String(r.created_at),
  }));

  const subscriptions: AdminWebhookSubscription[] = (subsRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    accountId: String(r.account_id),
    targetUrl: String(r.target_url),
    subscribedEvents: Array.isArray(r.subscribed_events) ? (r.subscribed_events as string[]) : [],
    status: String(r.status),
    failureCount: Number(r.failure_count ?? 0),
    disabledAt: r.disabled_at ? String(r.disabled_at) : null,
    createdAt: String(r.created_at),
  }));

  const recentDeliveries: AdminWebhookDeliveryFailure[] = (delsRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    subscriptionId: String(r.subscription_id),
    accountId: String(r.account_id),
    eventId: String(r.event_id),
    targetUrl: String(r.target_url),
    attemptCount: Number(r.attempt_count ?? 0),
    status: String(r.status),
    lastStatusCode: r.last_status_code !== null ? Number(r.last_status_code) : null,
    lastErrorCode: r.last_error_code ? String(r.last_error_code) : null,
    lastErrorMessage: r.last_error_message ? String(r.last_error_message) : null,
    nextRetryAt: r.next_retry_at ? String(r.next_retry_at) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));

  return { credentials, recentRequests, subscriptions, recentDeliveries };
}

/**
 * Loads failed outbound webhook deliveries across all accounts for /admin/failures.
 */
export async function loadOutboundWebhookFailures(
  admin: SupabaseClient,
  limit = 100,
): Promise<AdminWebhookDeliveryFailure[]> {
  const { data, error } = await admin
    .from('webhook_deliveries')
    .select('id, subscription_id, account_id, event_id, target_url, attempt_count, status, last_status_code, last_error_code, last_error_message, next_retry_at, created_at, updated_at')
    .in('status', ['failed', 'dead_letter'])
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  const accountIds = Array.from(new Set(data.map((d: Record<string, unknown>) => String(d.account_id)).filter(Boolean)));
  const nameMap = new Map<string, string>();
  if (accountIds.length) {
    const { data: accounts } = await admin
      .from('accounts')
      .select('id, business_name')
      .in('id', accountIds);
    for (const a of accounts ?? []) {
      const row = a as { id?: unknown; business_name?: unknown };
      if (row.id) nameMap.set(String(row.id), String(row.business_name || ''));
    }
  }

  return data.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    subscriptionId: String(r.subscription_id),
    accountId: String(r.account_id),
    businessName: nameMap.get(String(r.account_id)) ?? null,
    eventId: String(r.event_id),
    targetUrl: String(r.target_url),
    attemptCount: Number(r.attempt_count ?? 0),
    status: String(r.status),
    lastStatusCode: r.last_status_code !== null ? Number(r.last_status_code) : null,
    lastErrorCode: r.last_error_code ? String(r.last_error_code) : null,
    lastErrorMessage: r.last_error_message ? String(r.last_error_message) : null,
    nextRetryAt: r.next_retry_at ? String(r.next_retry_at) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));
}
