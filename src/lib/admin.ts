import type { SupabaseClient } from '@supabase/supabase-js';

// Shared helpers for the internal staff console (/admin). The auth gate itself
// (requireAdmin / isAdminEmail) lives in src/lib/auth.ts; this module holds the
// data helpers everything under /admin builds on.

export type AdminActionInput = {
  action: string;
  accountId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  /** WHY. The most valuable field in the trail and the one most often absent. */
  reason?: string | null;
  /** What the thing looked like before, and after. Enough to answer "what did
      this used to be" without restoring a backup. */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  meta?: Record<string, unknown>;
};

/**
 * Who is writing this row.
 *
 * The whole AdminContext rather than an email, so ip / requestId / staff_id
 * cannot be omitted by a caller who did not think about them — which is every
 * caller, because they are not about the action being taken. requirePermission
 * returns exactly this shape, so the audit row is complete by construction.
 */
export type AuditActor = {
  adminEmail: string;
  ip?: string | null;
  requestId?: string | null;
  staff?: { id: string } | null;
  permission?: string | null;
};

/**
 * The actor for work nobody triggered.
 *
 * The automated Quick Stop no-show lockout writes to this trail, and it has no
 * session, no address and no staff row. Naming that explicitly is better than
 * an optional context that a human caller could also leave empty by accident.
 */
export function systemActor(): AuditActor {
  return { adminEmail: 'system', ip: null, requestId: null, staff: null, permission: null };
}

// Append one row to the admin audit trail. Best-effort: a logging failure must
// never block the underlying staff action (the refund still happened), but we
// surface it to the server log so a broken audit path is noticed.
export async function logAdminAction(
  admin: SupabaseClient,
  actor: AuditActor,
  input: AdminActionInput,
): Promise<void> {
  try {
    await admin.from('admin_actions').insert({
      admin_email: actor.adminEmail,
      staff_id: actor.staff?.id || null,
      ip: actor.ip ?? null,
      request_id: actor.requestId ?? null,
      permission: actor.permission ?? null,
      action: input.action,
      account_id: input.accountId ?? null,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      reason: input.reason ?? null,
      before_value: input.before ?? null,
      after_value: input.after ?? null,
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
  reason: string | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  ip: string | null;
  request_id: string | null;
  permission: string | null;
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
    .select('id, admin_email, action, account_id, target_type, target_id, reason, before_value, after_value, ip, request_id, permission, meta, created_at')
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
// for the Quick Stop no-show goodwill credit and manual staff comps.
export async function issueAccountCredit(
  admin: SupabaseClient,
  actor: AuditActor,
  input: { accountId: string; amountCents: number; reason: string; source?: string; meta?: Record<string, unknown> },
): Promise<void> {
  await admin.from('account_credits').insert({
    account_id: input.accountId,
    amount_cents: Math.round(input.amountCents),
    reason: input.reason,
    source: input.source ?? 'admin',
    created_by: actor.adminEmail,
    meta: input.meta ?? {},
  });
  await logAdminAction(admin, actor, {
    action: 'account_credit',
    accountId: input.accountId,
    targetType: 'account',
    targetId: input.accountId,
    // Promoted out of meta: "why did we give this business money" is the
    // question the row exists to answer.
    reason: input.reason,
    meta: { amountCents: Math.round(input.amountCents), source: input.source ?? 'admin' },
  });
}
