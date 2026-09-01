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
