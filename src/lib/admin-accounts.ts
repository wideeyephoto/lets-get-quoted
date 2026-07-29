import type { SupabaseClient } from '@supabase/supabase-js';
import { getTrailingVolume } from '@/lib/payments';
import { getTierInfo, type TierInfo } from '@/lib/stripe';
import { getAccountOwnerEmail } from '@/lib/email';
import { getAccountCreditBalanceCents } from '@/lib/admin';

// Data layer for the admin console's account views. All reads use the passed-in
// service-role client (RLS is owner-scoped, so a session client can't cross
// tenants). Kept defensive: newer columns (suspension, extra-stop lock) degrade
// gracefully so the console works before the migration is applied everywhere.

export type AdminAccountRow = {
  id: string;
  account_number: number | null;
  business_name: string | null;
  plan: string | null;
  connect_onboarded: boolean | null;
  connect_disabled_at: string | null;
  suspended_at: string | null;
  created_at: string;
};

const ACCOUNT_LIST_COLUMNS =
  'id, account_number, business_name, plan, connect_onboarded, connect_disabled_at, suspended_at, created_at';

// Search accounts by business name or account number. Owner email isn't stored
// in our tables (it lives in auth.users), so it's resolved on the detail page,
// not here — keeping the list a single cheap query.
export async function listAccountsForAdmin(
  admin: SupabaseClient,
  opts: { query?: string; limit?: number } = {},
): Promise<AdminAccountRow[]> {
  let q = admin.from('accounts').select(ACCOUNT_LIST_COLUMNS).order('created_at', { ascending: false }).limit(opts.limit ?? 50);
  const term = opts.query?.trim();
  if (term) {
    const asNumber = Number(term.replace(/[^0-9]/g, ''));
    if (/^\d+$/.test(term.replace(/[^0-9]/g, '')) && Number.isFinite(asNumber) && asNumber > 0) {
      q = q.eq('account_number', asNumber);
    } else {
      q = q.ilike('business_name', `%${term}%`);
    }
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return data as AdminAccountRow[];
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
  extraStop: { active: number; total: number; noShows: number };
};

const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

export async function getAccountAdminDetail(admin: SupabaseClient, id: string): Promise<AdminAccountDetail | null> {
  const { data: account, error } = await admin.from('accounts').select('*').eq('id', id).maybeSingle();
  if (error || !account) return null;

  const since = new Date(Date.now() - THIRTY_DAYS).toISOString();
  const [ownerEmail, siteRes, trailingVolume, leads30d, jobsActive, paidRows, disputes, recentPayments, creditBalanceCents, esActive, esTotal, esNoShows] =
    await Promise.all([
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
    extraStop: { active: esActive.count ?? 0, total: esTotal.count ?? 0, noShows: esNoShows.count ?? 0 },
  };
}
