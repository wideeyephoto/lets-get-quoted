import type { SupabaseClient } from '@supabase/supabase-js';
import { getTrailingVolume } from '@/lib/payments';
import { getTierInfo, type TierInfo } from '@/lib/stripe';
import { getAccountOwnerEmail } from '@/lib/email';
import { getAccountCreditBalanceCents } from '@/lib/admin';
import { listLoginEvents, type LoginEvent } from '@/lib/login-events';
import { listAccountNotes, listAccountTags, type AccountNote, type AccountTag } from '@/lib/account-notes';
import { listAccountAttachments, type AccountAttachment } from '@/lib/account-attachments';
import { listPrivacyRequests, type PrivacyRequest } from '@/lib/privacy-requests';
import type { AccountFilter } from '@/lib/admin-account-filters';

// Data layer for the admin console's account views. All reads use the passed-in
// service-role client (RLS is owner-scoped, so a session client can't cross
// tenants). Kept defensive: newer columns (suspension, quick-stop lock) degrade
// gracefully so the console works before the migration is applied everywhere.

export type AdminAccountRow = {
  id: string;
  account_number: number | null;
  business_name: string | null;
  // The public-facing name the owner set in their site settings. Preferred for
  // display — accounts.business_name defaults to the placeholder 'My Business'
  // and many owners only ever set company_name.
  company_name: string | null;
  plan: string | null;
  connect_onboarded: boolean | null;
  // Selected so the list can say HOW FAR through payout setup an account got,
  // not merely that it is unfinished. See lib/admin-account-filters.ts.
  stripe_connect_id: string | null;
  connect_disabled_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  suspended_by: string | null;
  created_at: string;
};

const ACCOUNT_LIST_COLUMNS =
  'id, account_number, business_name, plan, connect_onboarded, stripe_connect_id, connect_disabled_at, suspended_at, suspended_reason, suspended_by, created_at';

/**
 * Narrow a query to one of the named slices the console counts.
 *
 * Every filter here is the exact predicate of a number rendered somewhere else
 * — `not_onboarded` matches getNotOnboardedCount, `payouts_paused` matches
 * getPausedPayouts — so a card's count and the list it links to cannot disagree.
 * Keeping them in one place is the point: two copies of "what counts as not
 * onboarded" drift, and the drift shows up as a number that opens the wrong
 * rows, which is worse than a number that opens nothing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyAccountFilter(query: any, filter: AccountFilter | undefined, joinedSinceIso?: string) {
  // Composes with the named filter rather than replacing it, so "not onboarded
  // AND joined this month" is expressible. Applied first because it is the
  // cheaper predicate on an indexed column.
  if (joinedSinceIso) query = query.gte('created_at', joinedSinceIso);
  switch (filter) {
    case 'not_onboarded':
      return query.eq('connect_onboarded', false);
    case 'connect_incomplete':
      return query.eq('connect_onboarded', false).not('stripe_connect_id', 'is', null);
    case 'payouts_paused':
      return query.not('connect_disabled_at', 'is', null);
    case 'suspended':
      return query.not('suspended_at', 'is', null);
    default:
      return query;
  }
}

/**
 * The true size of a slice, independent of the page limit.
 *
 * Without this the list header can only report how many rows it fetched, and a
 * capped list that says "50" when the answer is 180 is a number that lies
 * quietly — the failure mode the drill-downs exist to remove.
 */
export async function countAccountsForAdmin(
  admin: SupabaseClient,
  opts: { filter?: AccountFilter; joinedSince?: string } = {},
): Promise<number> {
  const { count, error } = await applyAccountFilter(
    admin.from('accounts').select('id', { count: 'exact', head: true }),
    opts.filter,
    opts.joinedSince,
  );
  if (error) {
    console.error('countAccountsForAdmin failed:', error);
    return 0;
  }
  return count ?? 0;
}

// The name to show for an account: the site's company_name wins, then the
// account's business_name (unless it's the signup placeholder), then a fallback.
export function accountDisplayName(row: { company_name?: string | null; business_name?: string | null }): string {
  const company = row.company_name?.trim();
  if (company) return company;
  const biz = row.business_name?.trim();
  if (biz && biz.toLowerCase() !== 'my business') return biz;
  return biz || 'Untitled business';
}

// Search accounts by business name, site company name, or account number. Owner
// email isn't stored in our tables (it lives in auth.users), so it's resolved on
// the detail page, not here.
export async function listAccountsForAdmin(
  admin: SupabaseClient,
  opts: { query?: string; limit?: number; filter?: AccountFilter; joinedSince?: string } = {},
): Promise<AdminAccountRow[]> {
  const limit = opts.limit ?? 50;
  const term = opts.query?.trim();
  const filter = opts.filter;
  // Every branch below narrows through this, so a search and a filter compose
  // rather than one silently winning.
  const base = () => applyAccountFilter(admin.from('accounts').select(ACCOUNT_LIST_COLUMNS), filter, opts.joinedSince);
  let rows: AdminAccountRow[] = [];

  if (term) {
    const digits = term.replace(/[^0-9]/g, '');
    if (/^\d+$/.test(digits) && Number(digits) > 0) {
      const { data } = await base().eq('account_number', Number(digits)).limit(limit);
      rows = (data ?? []) as AdminAccountRow[];
    } else {
      // Match either the account's business_name OR the site's company_name.
      const [byBiz, bySite] = await Promise.all([
        base().ilike('business_name', `%${term}%`).limit(limit),
        admin.from('sites').select('account_id').ilike('company_name', `%${term}%`).limit(limit),
      ]);
      const found = (byBiz.data ?? []) as AdminAccountRow[];
      const haveIds = new Set(found.map((r) => r.id));
      const siteIds = (bySite.data ?? []).map((s) => (s as { account_id: string }).account_id).filter((id) => id && !haveIds.has(id));
      if (siteIds.length) {
        // Re-filtered, not just re-fetched. The sites table knows nothing about
        // onboarding or suspension, so without this a name match could smuggle
        // an account into a filtered list it does not belong in.
        const { data: extra } = await base().in('id', siteIds).limit(limit);
        rows = [...found, ...((extra ?? []) as AdminAccountRow[])];
      } else {
        rows = found;
      }
    }
  } else {
    const { data } = await base().order('created_at', { ascending: false }).limit(limit);
    rows = (data ?? []) as AdminAccountRow[];
  }

  // Stitch each account's site company_name in, then order newest-first.
  const ids = rows.map((r) => r.id);
  const nameMap = new Map<string, string | null>();
  if (ids.length) {
    const { data } = await admin.from('sites').select('account_id, company_name').in('account_id', ids);
    for (const s of data ?? []) {
      const row = s as { account_id: string; company_name: string | null };
      nameMap.set(row.account_id, row.company_name);
    }
  }
  return rows
    .map((r) => ({ ...r, company_name: nameMap.get(r.id) ?? null }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export type AdminActivity = {
  leads30d: number;
  jobsActive: number;
  paidVolume30dCents: number;
  openDisputes: number;
};

export type AdminPaymentRow = {
  id: string;
  label: string | null;
  amount: number | null;
  status: string | null;
  kind: string | null;
  created_at: string | null;
  paid_at: string | null;
  refunded_amount: number | null;
};

export type AdminAccountDetail = {
  account: Record<string, unknown> | null;
  ownerEmail: string | null;
  site: { company_name: string | null; phone: string | null } | null;
  tier: TierInfo;
  trailingVolume: number;
  activity: AdminActivity;
  recentPayments: AdminPaymentRow[];
  creditBalanceCents: number;
  quickStop: { active: number; total: number; noShows: number };
  loginEvents: LoginEvent[];
  notes: AccountNote[];
  tags: AccountTag[];
  attachments: AccountAttachment[];
  privacyRequests: PrivacyRequest[];
};

const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

export async function getAccountAdminDetail(admin: SupabaseClient, id: string): Promise<AdminAccountDetail | null> {
  const { data: account, error } = await admin.from('accounts').select('*').eq('id', id).maybeSingle();
  if (error || !account) return null;

  const since = new Date(Date.now() - THIRTY_DAYS).toISOString();
  const [
    ownerEmail,
    siteRes,
    trailingVolume,
    leads30d,
    jobsActive,
    paidRows,
    disputes,
    recentPayments,
    creditBalanceCents,
    esActive,
    esTotal,
    esNoShows,
    loginEvents,
    notes,
    tags,
    attachments,
    privacyRequests,
  ] = await Promise.all([
    getAccountOwnerEmail(admin, id).catch(() => null),
    admin.from('sites').select('company_name, phone').eq('account_id', id).maybeSingle(),
    getTrailingVolume(id).catch(() => 0),
    admin.from('leads').select('id', { count: 'exact', head: true }).eq('account_id', id).gte('created_at', since),
    admin.from('jobs').select('id', { count: 'exact', head: true }).eq('account_id', id).in('status', ['new_lead', 'in_progress']),
    admin.from('payments').select('amount').eq('account_id', id).eq('status', 'paid').gte('paid_at', since),
    admin.from('payments').select('id', { count: 'exact', head: true }).eq('account_id', id).eq('status', 'disputed'),
    admin
      .from('payments')
      .select('id, label, amount, status, kind, created_at, paid_at, refunded_amount')
      .eq('account_id', id)
      .order('created_at', { ascending: false })
      .limit(12),
    getAccountCreditBalanceCents(admin, id),
    admin.from('extra_stop_requests').select('id', { count: 'exact', head: true }).eq('account_id', id).in('status', ['awaiting_contractor', 'contractor_offer_sent', 'awaiting_customer_payment', 'confirmed', 'en_route', 'arrived']),
    admin.from('extra_stop_requests').select('id', { count: 'exact', head: true }).eq('account_id', id),
    admin.from('extra_stop_requests').select('id', { count: 'exact', head: true }).eq('account_id', id).eq('status', 'no_show_confirmed'),
    listLoginEvents(admin, id, 10),
    listAccountNotes(admin, id),
    listAccountTags(admin, id),
    listAccountAttachments(admin, id),
    listPrivacyRequests(admin, id),
  ]);

  const paidVolume30d = (paidRows.data ?? []).reduce((sum, r) => sum + (Number((r as { amount: number }).amount) || 0), 0);

  return {
    account: account as Record<string, unknown>,
    ownerEmail,
    site: (siteRes.data as { company_name: string | null; phone: string | null } | null) ?? null,
    tier: getTierInfo(trailingVolume),
    trailingVolume,
    activity: {
      leads30d: leads30d.count ?? 0,
      jobsActive: jobsActive.count ?? 0,
      paidVolume30dCents: Math.round(paidVolume30d * 100),
      openDisputes: disputes.count ?? 0,
    },
    recentPayments: (recentPayments.data ?? []) as AdminPaymentRow[],
    creditBalanceCents,
    quickStop: { active: esActive.count ?? 0, total: esTotal.count ?? 0, noShows: esNoShows.count ?? 0 },
    loginEvents,
    notes,
    tags,
    attachments,
    privacyRequests,
  };
}
