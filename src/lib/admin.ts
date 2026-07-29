import type { SupabaseClient } from '@supabase/supabase-js';

// Shared helpers for the internal staff console (/admin). The auth gate itself
// (requireAdmin / isAdminEmail) lives in src/lib/auth.ts; this module holds the
// data helpers everything under /admin builds on.

export type AdminActionInput = {
  action: string;
  accountId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown>;
};

// Append one row to the admin audit trail. Best-effort: a logging failure must
// never block the underlying staff action (the refund still happened), but we
// surface it to the server log so a broken audit path is noticed.
export async function logAdminAction(
  admin: SupabaseClient,
  adminEmail: string,
  input: AdminActionInput,
): Promise<void> {
  try {
    await admin.from('admin_actions').insert({
      admin_email: adminEmail,
      action: input.action,
      account_id: input.accountId ?? null,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      meta: input.meta ?? {},
    });
  } catch (error) {
    console.error('logAdminAction failed:', error instanceof Error ? error.message : error);
  }
}

export type AdminActionRow = {
  id: string;
  admin_email: string;
  action: string;
  account_id: string | null;
  target_type: string | null;
  target_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

// Recent audit-trail rows, newest first. Optionally scoped to one account.
export async function listAdminActions(
  admin: SupabaseClient,
  opts: { accountId?: string; limit?: number } = {},
): Promise<AdminActionRow[]> {
  let query = admin
    .from('admin_actions')
    .select('id, admin_email, action, account_id, target_type, target_id, meta, created_at')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.accountId) query = query.eq('account_id', opts.accountId);
  const { data, error } = await query;
  if (error || !data) return [];
  return data as AdminActionRow[];
}

// Current credit balance for an account (sum of the signed ledger, in cents).
export async function getAccountCreditBalanceCents(
  admin: SupabaseClient,
  accountId: string,
): Promise<number> {
  const { data, error } = await admin
    .from('account_credits')
    .select('amount_cents')
    .eq('account_id', accountId);
  if (error || !data) return 0;
  return data.reduce((sum, row) => sum + (Number((row as { amount_cents: number }).amount_cents) || 0), 0);
}

// Issue (or reverse, with a negative amount) an account credit and log it. Used
// for the Extra Stop no-show goodwill credit and manual staff comps.
export async function issueAccountCredit(
  admin: SupabaseClient,
  adminEmail: string,
  input: { accountId: string; amountCents: number; reason: string; source?: string; meta?: Record<string, unknown> },
): Promise<void> {
  await admin.from('account_credits').insert({
    account_id: input.accountId,
    amount_cents: Math.round(input.amountCents),
    reason: input.reason,
    source: input.source ?? 'admin',
    created_by: adminEmail,
    meta: input.meta ?? {},
  });
  await logAdminAction(admin, adminEmail, {
    action: 'account_credit',
    accountId: input.accountId,
    targetType: 'account',
    targetId: input.accountId,
    meta: { amountCents: Math.round(input.amountCents), reason: input.reason, source: input.source ?? 'admin' },
  });
}
