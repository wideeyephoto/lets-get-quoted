import type { SupabaseClient } from '@supabase/supabase-js';

// This ledger is scoped to rows with paid_at: the records behind the Command
// Center's "payments processed" number. Uncollected attempts have no processed
// date and therefore do not belong in this period selector.
export const PAYMENT_LEDGER_STATUSES = ['paid', 'refunded', 'disputed'] as const;
export type PaymentLedgerStatus = (typeof PAYMENT_LEDGER_STATUSES)[number];

export type PaymentLedgerRow = {
  id: string;
  account_id: string;
  label: string | null;
  amount: number | null;
  status: string;
  paid_at: string | null;
  refunded_at: string | null;
  refunded_amount: number | null;
  platform_fee: number | null;
  platform_fee_refunded: number | null;
  stripe_payment_intent: string | null;
  stripe_dispute_id: string | null;
};

const COLUMNS = 'id, account_id, label, amount, status, paid_at, refunded_at, refunded_amount, platform_fee, platform_fee_refunded, stripe_payment_intent, stripe_dispute_id';

export function isPaymentLedgerStatus(value: unknown): value is PaymentLedgerStatus {
  return typeof value === 'string' && (PAYMENT_LEDGER_STATUSES as readonly string[]).includes(value);
}

export async function listAdminPayments(
  admin: SupabaseClient,
  opts: { startIso: string; endIso: string; status?: PaymentLedgerStatus; accountId?: string; query?: string; page?: number; pageSize?: number },
): Promise<{ rows: PaymentLedgerRow[]; total: number; available: boolean }> {
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 50));
  const page = Math.max(1, opts.page ?? 1);
  let query = admin
    .from('payments')
    .select(COLUMNS, { count: 'exact' })
    .is('test_marker', null)
    .not('paid_at', 'is', null)
    .gte('paid_at', opts.startIso)
    .lt('paid_at', opts.endIso);

  if (opts.status) query = query.eq('status', opts.status);
  if (opts.accountId) query = query.eq('account_id', opts.accountId);
  const term = opts.query?.trim();
  if (term) {
    // Provider identifiers and UUIDs have a deliberately narrow alphabet, so
    // they can safely enter PostgREST's OR expression. Human text stays in a
    // single parameterized ILIKE filter.
    if (/^[a-zA-Z0-9_-]{6,160}$/.test(term)) {
      query = query.or(`id.eq.${term},stripe_payment_intent.eq.${term},stripe_dispute_id.eq.${term}`);
    } else {
      query = query.ilike('label', `%${term.replace(/[%_]/g, '')}%`);
    }
  }

  const from = (page - 1) * pageSize;
  const { data, count, error } = await query.order('paid_at', { ascending: false }).range(from, from + pageSize - 1);
  if (error) {
    console.error('listAdminPayments failed:', error);
    return { rows: [], total: 0, available: false };
  }
  return { rows: (data ?? []) as PaymentLedgerRow[], total: count ?? 0, available: true };
}

export type AdminPaymentDetail = {
  id: string;
  account_id: string;
  job_id: string | null;
  invoice_id: string | null;
  kind: string | null;
  label: string | null;
  amount: number | null;
  status: string | null;
  platform_fee: number | null;
  fee_rate: number | null;
  refunded_amount: number | null;
  platform_fee_refunded: number | null;
  refunded_at: string | null;
  stripe_payment_intent: string | null;
  stripe_checkout_session: string | null;
  stripe_dispute_id: string | null;
  disputed_at: string | null;
  dispute_reason: string | null;
  dispute_status: string | null;
  dispute_due_by: string | null;
  dunning_state: string | null;
  failure_message: string | null;
  failed_at: string | null;
  requested_at: string | null;
  paid_at: string | null;
  created_at: string | null;
};

const DETAIL_COLUMNS = `
  id, account_id, job_id, invoice_id, kind, label, amount, status,
  platform_fee, fee_rate, refunded_amount, platform_fee_refunded, refunded_at,
  stripe_payment_intent, stripe_checkout_session, stripe_dispute_id,
  disputed_at, dispute_reason, dispute_status, dispute_due_by,
  dunning_state, failure_message, failed_at,
  requested_at, paid_at, created_at
`.replace(/\s+/g, ' ').trim();

export async function getPaymentForAdmin(admin: SupabaseClient, paymentId: string): Promise<AdminPaymentDetail | null> {
  const { data, error } = await admin.from('payments').select(DETAIL_COLUMNS).eq('id', paymentId).maybeSingle();
  if (error) {
    console.error('getPaymentForAdmin failed:', error);
    return null;
  }
  return (data as AdminPaymentDetail | null) ?? null;
}

const money = (value: number | null | undefined): number => Number(value) || 0;

export function refundableCents(payment: Pick<AdminPaymentDetail, 'amount' | 'refunded_amount' | 'status'>): number {
  if (payment.status !== 'paid') return 0;
  const total = Math.round(money(payment.amount) * 100);
  const already = Math.round(money(payment.refunded_amount) * 100);
  return Math.max(0, total - already);
}

export function refundBlockedReason(payment: AdminPaymentDetail): string | null {
  if (payment.status === 'refunded') return 'This payment has already been fully refunded.';
  if (payment.status === 'disputed') return 'This payment is disputed. Resolve it on Stripe — refunding here as well would pay the customer twice.';
  if (payment.status !== 'paid') return 'Only a payment that has actually been collected can be refunded.';
  if (!payment.stripe_payment_intent) return 'No Stripe payment intent on this row, so there is nothing to refund against. It was probably recorded by hand or imported.';
  if (refundableCents(payment) <= 0) return 'Nothing left to refund on this payment.';
  return null;
}

export function stripePaymentUrl(payment: AdminPaymentDetail): string | null {
  if (payment.stripe_payment_intent) return `https://dashboard.stripe.com/payments/${payment.stripe_payment_intent}`;
  if (payment.stripe_checkout_session) return `https://dashboard.stripe.com/checkout/sessions/${payment.stripe_checkout_session}`;
  return null;
}
