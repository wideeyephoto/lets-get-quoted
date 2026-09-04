import type { SupabaseClient } from '@supabase/supabase-js';
import { getQuickStopRequestById, type QuickStopRequest } from '@/lib/quick-stop-requests';

// Data layer for the admin console's Quick Stop governance views. Cross-account,
// service-role reads. Account names are stitched in with a second query rather
// than a PostgREST embed, to stay robust regardless of FK-name resolution.

export type AdminQuickStopRow = QuickStopRequest & {
  business_name: string | null;
  company_name: string | null;
  account_number: number | null;
};

const LIST_COLUMNS =
  'id, account_id, status, client_name, client_phone, fee_cents, refund_cents, arrival_date, arrival_start, arrival_end, payment_id, paid_at, no_show_reported_at, created_at, ai_summary';

export type ListQuickStopsResult = {
  rows: AdminQuickStopRow[];
  total: number;
};

export async function listQuickStopRequestsForAdmin(
  admin: SupabaseClient,
  opts: { statuses?: string[]; limit?: number; page?: number; pageSize?: number; accountId?: string } = {},
): Promise<ListQuickStopsResult> {
  const pageSize = opts.pageSize ?? opts.limit ?? 50;
  const page = Math.max(1, opts.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = admin
    .from('extra_stop_requests')
    .select(LIST_COLUMNS, { count: 'exact' })
    .is('test_marker', null)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (opts.statuses && opts.statuses.length) q = q.in('status', opts.statuses);
  // Lets the per-account no-show and Quick Stop counts open the requests they
  // count, instead of pointing at a capped cross-account list.
  if (opts.accountId) q = q.eq('account_id', opts.accountId);
  const { data, error, count } = await q;
  if (error || !data) return { rows: [], total: 0 };

  const rows = data as unknown as QuickStopRequest[];
  const total = count ?? rows.length;
  const accountIds = [...new Set(rows.map((r) => r.account_id).filter(Boolean))];
  const names = new Map<string, { business_name: string | null; company_name: string | null; account_number: number | null }>();
  if (accountIds.length) {
    const [acctsRes, sitesRes] = await Promise.all([
      admin.from('accounts').select('id, business_name, account_number').in('id', accountIds),
      admin.from('sites').select('account_id, company_name').in('account_id', accountIds),
    ]);
    const siteNames = new Map<string, string | null>();
    for (const s of sitesRes.data ?? []) {
      const site = s as { account_id: string; company_name: string | null };
      siteNames.set(site.account_id, site.company_name);
    }
    for (const acc of acctsRes.data ?? []) {
      const a = acc as { id: string; business_name: string | null; account_number: number | null };
      names.set(a.id, { business_name: a.business_name, company_name: siteNames.get(a.id) ?? null, account_number: a.account_number });
    }
  }
  const hydrated = rows.map((r) => ({ ...r, ...(names.get(r.account_id) ?? { business_name: null, company_name: null, account_number: null }) }));
  return { rows: hydrated, total };
}

export type QuickStopEventRow = {
  id: string;
  actor: string;
  from_status: string | null;
  to_status: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export type AdminQuickStopDetail = {
  request: QuickStopRequest;
  business_name: string | null;
  company_name: string | null;
  account_number: number | null;
  events: QuickStopEventRow[];
  payment: { id: string; amount: number | null; status: string | null; refunded_amount: number | null } | null;
};

export async function getQuickStopAdminDetail(admin: SupabaseClient, id: string): Promise<AdminQuickStopDetail | null> {
  const request = await getQuickStopRequestById(admin, id);
  if (!request) return null;

  const [acctRes, siteRes, eventsRes, paymentRes] = await Promise.all([
    admin.from('accounts').select('business_name, account_number').eq('id', request.account_id).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', request.account_id).maybeSingle(),
    admin.from('extra_stop_events').select('id, actor, from_status, to_status, meta, created_at').eq('request_id', id).order('created_at', { ascending: true }),
    request.payment_id
      ? admin.from('payments').select('id, amount, status, refunded_amount').eq('id', request.payment_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const acct = acctRes.data as { business_name: string | null; account_number: number | null } | null;
  const site = siteRes.data as { company_name: string | null } | null;
  return {
    request,
    business_name: acct?.business_name ?? null,
    company_name: site?.company_name ?? null,
    account_number: acct?.account_number ?? null,
    events: (eventsRes.data ?? []) as QuickStopEventRow[],
    payment: (paymentRes.data as AdminQuickStopDetail['payment']) ?? null,
  };
}
