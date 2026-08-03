import type { SupabaseClient } from '@supabase/supabase-js';
import { createPortalToken, hashPortalToken, portalExpiry, summarisePortal, type PortalJob, type PortalView } from '@/lib/client-portal';
import { listClientWarranties } from '@/lib/warranties-data';
import { toClientWarranties, type ClientWarranty } from '@/lib/warranties';

/**
 * Mint a portal link for whoever owns this email, if anybody does.
 *
 * Returns the token ONLY when there's a match — but the caller must send the
 * same acknowledgement either way. A page that says "no account found" tells a
 * stranger which of their neighbours used this contractor.
 *
 * Any previously issued link for the same client is revoked. A homeowner who
 * asks for a new link has usually lost the old one, and leaving a forgotten link
 * live in an old inbox is the failure mode nobody notices.
 */
export async function issuePortalLink(
  admin: SupabaseClient,
  accountId: string,
  email: string,
): Promise<{ token: string; clientId: string } | null> {
  const needle = email.trim().toLowerCase();
  if (!needle) return null;

  const { data: client } = await admin
    .from('clients')
    .select('id, email')
    .eq('account_id', accountId)
    .ilike('email', needle)
    .maybeSingle();
  if (!client) return null;

  await admin
    .from('client_portal_access')
    .update({ revoked_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('client_id', client.id)
    .is('revoked_at', null);

  const token = createPortalToken();
  const { error } = await admin.from('client_portal_access').insert({
    account_id: accountId,
    client_id: client.id as string,
    token_hash: hashPortalToken(token),
    sent_to: needle,
    expires_at: portalExpiry(),
  });
  if (error) {
    console.error('Portal link issue failed:', error.message);
    return null;
  }
  return { token, clientId: client.id as string };
}

export type PortalPayload = PortalView & { warranties: ClientWarranty[] };

/**
 * Everything a homeowner sees about their own history with one contractor.
 *
 * Scoped to a single client of a single account throughout. Every query filters
 * on both, so a token can only ever open the door it was cut for.
 */
export async function loadPortal(admin: SupabaseClient, accountId: string, clientId: string): Promise<PortalPayload | null> {
  const [{ data: client }, { data: account }, { data: site }] = await Promise.all([
    admin.from('clients').select('name').eq('account_id', accountId).eq('id', clientId).maybeSingle(),
    admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);
  if (!client) return null;

  const { data: jobRows } = await admin
    .from('jobs')
    .select('id, ref, scope, status, scheduled_for, completed_at, address, quoted_amount')
    .eq('account_id', accountId)
    .eq('client_id', clientId)
    .neq('status', 'archived')
    .order('scheduled_for', { ascending: false, nullsFirst: false })
    .limit(100);

  const jobs: PortalJob[] = (jobRows ?? []).map((row) => ({
    id: row.id as string,
    ref: (row.ref as string | null) ?? null,
    scope: (row.scope as string | null) ?? null,
    status: (row.status as string) ?? 'new_lead',
    scheduledFor: (row.scheduled_for as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    quotedAmount: Number(row.quoted_amount) || 0,
  }));

  const warranties = toClientWarranties(await listClientWarranties(admin, accountId, clientId));

  return {
    ...summarisePortal({
      businessName: site?.company_name || account?.business_name || 'your contractor',
      clientName: (client.name as string) ?? 'there',
      jobs,
    }),
    warranties,
  };
}

/** Owner-facing: links this client currently holds, so they can be revoked. */
export async function listPortalLinks(supabase: SupabaseClient, accountId: string, clientId: string) {
  const { data, error } = await supabase
    .from('client_portal_access')
    .select('id, sent_to, expires_at, revoked_at, last_used_at, created_at')
    .eq('account_id', accountId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  return error ? [] : data ?? [];
}

export async function revokePortalLinks(supabase: SupabaseClient, accountId: string, clientId: string): Promise<void> {
  await supabase
    .from('client_portal_access')
    .update({ revoked_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('client_id', clientId)
    .is('revoked_at', null);
}
