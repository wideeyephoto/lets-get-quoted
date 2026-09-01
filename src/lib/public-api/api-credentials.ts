import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';

export const API_TOKEN_PREFIX = 'lgq_live_';

export type ApiScope =
  | 'leads.read'
  | 'leads.write'
  | 'webhooks.manage'
  | 'clients.read'
  | 'jobs.read';

export const ALL_API_SCOPES: readonly ApiScope[] = Object.freeze([
  'leads.read',
  'leads.write',
  'webhooks.manage',
  'clients.read',
  'jobs.read',
]);

export const API_SCOPE_DESCRIPTIONS: Readonly<Record<ApiScope, string>> = Object.freeze({
  'leads.read': 'Read workspace leads and triage data',
  'leads.write': 'Create and update leads',
  'webhooks.manage': 'Manage webhook subscriptions and replay deliveries',
  'clients.read': 'Read client profiles and contact channels',
  'jobs.read': 'Read jobs, schedule, and assignments',
});

export type ApiCredentialRow = {
  id: string;
  account_id: string;
  name: string;
  token_hash: string;
  token_prefix: string;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
  created_by: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VerifiedApiToken = {
  credentialId: string;
  accountId: string;
  name: string;
  tokenPrefix: string;
  scopes: Set<ApiScope>;
  expiresAt: string | null;
  createdBy: string | null;
};

export type GeneratedApiToken = {
  credentialId: string;
  tokenSecret: string; // ONLY returned once upon generation
  tokenPrefix: string;
  name: string;
  scopes: ApiScope[];
  expiresAt: string | null;
};


/**
 * Generates a raw token secret with standard prefix and 32 bytes entropy.
 */
export function generateApiTokenSecret(): string {
  const randomEntropy = randomBytes(32).toString('base64url');
  return `${API_TOKEN_PREFIX}${randomEntropy}`;
}

/**
 * Validates whether a token matches the expected structure.
 */
export function isValidApiTokenFormat(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  return /^lgq_live_[A-Za-z0-9_-]{43}$/.test(token.trim());
}

/**
 * Computes deterministic SHA-256 hash of secret token string.
 */
export function hashApiToken(tokenSecret: string): string {
  return createHash('sha256').update(tokenSecret.trim(), 'utf8').digest('hex');
}

/**
 * Generates a new cryptographically random, account-bound API token.
 */
export async function createApiToken(
  admin: SupabaseClient,
  params: {
    accountId: string;
    name: string;
    scopes: ApiScope[];
    createdBy?: string | null;
    expiresInDays?: number | null;
  }
): Promise<GeneratedApiToken> {
  const cleanName = params.name.trim();
  if (!cleanName) {
    throw new Error('API token name is required.');
  }

  const validScopes = params.scopes.filter((scope): scope is ApiScope =>
    ALL_API_SCOPES.includes(scope)
  );
  if (!validScopes.length) {
    throw new Error('At least one valid scope is required.');
  }

  // 32 random bytes, base64url encoded without padding
  const randomEntropy = randomBytes(32).toString('base64url');
  const tokenSecret = `${API_TOKEN_PREFIX}${randomEntropy}`;
  const tokenPrefix = `${API_TOKEN_PREFIX}${randomEntropy.slice(0, 6)}...`;
  const tokenHash = hashApiToken(tokenSecret);

  let expiresAt: string | null = null;
  if (params.expiresInDays && params.expiresInDays > 0) {
    expiresAt = new Date(Date.now() + params.expiresInDays * 86_400_000).toISOString();
  }

  const { data, error } = await admin
    .from('api_credentials')
    .insert({
      account_id: params.accountId,
      name: cleanName,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      scopes: validScopes,
      expires_at: expiresAt,
      created_by: params.createdBy ?? null,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create API credential: ${error?.message || 'Unknown error'}`);
  }

  return {
    credentialId: data.id,
    tokenSecret,
    tokenPrefix,
    name: cleanName,
    scopes: validScopes,
    expiresAt,
  };
}

/**
 * Authenticates an incoming Bearer token against stored credentials and account suspension status.
 */
export async function verifyApiToken(
  admin: SupabaseClient,
  rawToken: string
): Promise<VerifiedApiToken | null> {
  const token = rawToken.trim();
  if (!token.startsWith(API_TOKEN_PREFIX)) {
    return null;
  }

  const tokenHash = hashApiToken(token);

  const { data: cred, error: credError } = await admin
    .from('api_credentials')
    .select('id, account_id, name, token_prefix, scopes, expires_at, revoked_at, created_by')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .maybeSingle();

  if (credError || !cred) {
    return null;
  }

  // Check expiration
  if (cred.expires_at && new Date(cred.expires_at).getTime() <= Date.now()) {
    return null;
  }

  // Verify workspace is active and not suspended
  const { data: account, error: accError } = await admin
    .from('accounts')
    .select('id, suspended_at')
    .eq('id', cred.account_id)
    .maybeSingle();

  if (accError || !account || (account as { suspended_at?: string | null }).suspended_at) {
    return null;
  }

  // Asynchronously record last_used_at without blocking the hot path
  try {
    admin
      .from('api_credentials')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', cred.id)
      .then();
  } catch {
    // Non-blocking telemetry
  }

  const parsedScopes = new Set<ApiScope>();
  if (Array.isArray(cred.scopes)) {
    for (const scope of cred.scopes) {
      if (ALL_API_SCOPES.includes(scope as ApiScope)) {
        parsedScopes.add(scope as ApiScope);
      }
    }
  }

  return {
    credentialId: cred.id,
    accountId: cred.account_id,
    name: cred.name,
    tokenPrefix: cred.token_prefix,
    scopes: parsedScopes,
    expiresAt: cred.expires_at,
    createdBy: cred.created_by,
  };
}

/**
 * Revokes an existing API credential.
 */
export async function revokeApiToken(
  admin: SupabaseClient,
  accountId: string,
  credentialId: string
): Promise<boolean> {
  const { error } = await admin
    .from('api_credentials')
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', credentialId)
    .is('revoked_at', null);

  return !error;
}

/**
 * Lists all active and revoked API credentials for an account (secrets are never returned).
 */
export async function listApiTokens(
  admin: SupabaseClient,
  accountId: string
): Promise<ApiCredentialRow[]> {
  const { data, error } = await admin
    .from('api_credentials')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ApiCredentialRow[];
}
