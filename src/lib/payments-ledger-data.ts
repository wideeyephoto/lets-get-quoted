import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPages } from '@/lib/pagination';
import type { PaymentKind, PaymentStatus } from '@/lib/payments';
import { toCents, fromCents } from '@/lib/stripe';

export type PaymentLedgerItem = {
  id: string;
  accountId: string;
  jobId: string;
  jobRef: string;
  clientName: string;
  clientPhone: string | null;
  invoiceId: string | null;
  invoiceRef: string | null;
  kind: PaymentKind | 'quick_stop' | 'subscription' | 'manual';
  label: string;
  amount: number;
  platformFee: number;
  netAmount: number;
  feeRate: number | null;
  status: PaymentStatus;
  paymentMethod: string;
  cardBrand: string | null;
  cardLast4: string | null;
  paidAt: string | null;
  requestedAt: string;
  refundedAmount: number;
  disputedAt: string | null;
  disputeReason: string | null;
  disputeStatus: string | null;
  chargeModel: string | null;
  stripePaymentIntent: string | null;
  stripeCheckoutSession: string | null;
  asyncPaymentPendingAt: string | null;
};

export type PaymentsLedgerSummary = {
  grossRevenue: number;
  netRevenue: number;
  totalFees: number;
  totalRefunds: number;
  paidCount: number;
  processingCount: number;
  pendingAchCount: number;
  failedCount: number;
  disputedCount: number;
  averageTransaction: number;
  achSavingsEstimated: number;
};

export type LedgerFilterOptions = {
  range?: 'today' | '7d' | '30d' | '90d' | 'ytd' | 'all';
  status?: string;
  kind?: string;
  method?: string;
  query?: string;
  page?: number;
  pageSize?: number;
};

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

export function resolveLedgerDateWindow(range: string = '30d'): { start: string | null; end: string } {
  const now = new Date();
  const end = now.toISOString();

  if (range === 'all') {
    return { start: null, end };
  }

  const startDate = new Date(now);
  if (range === 'today') {
    startDate.setUTCHours(0, 0, 0, 0);
  } else if (range === '7d') {
    startDate.setUTCDate(startDate.getUTCDate() - 7);
  } else if (range === '90d') {
    startDate.setUTCDate(startDate.getUTCDate() - 90);
  } else if (range === 'ytd') {
    startDate.setUTCMonth(0, 1);
    startDate.setUTCHours(0, 0, 0, 0);
  } else {
    // Default 30d
    startDate.setUTCDate(startDate.getUTCDate() - 30);
  }

  return { start: startDate.toISOString(), end };
}

type DbPaymentRow = {
  id: string;
  account_id: string;
  job_id: string;
  invoice_id: string | null;
  kind: PaymentKind | 'quick_stop' | 'subscription' | 'manual';
  label: string;
  amount: number | string;
  status: PaymentStatus;
  platform_fee: number | string | null;
  fee_rate: number | string | null;
  fee_basis_amount?: number | string | null;
  stripe_checkout_session: string | null;
  stripe_payment_intent: string | null;
  async_payment_pending_at: string | null;
  homeowner_phone: string | null;
  requested_at: string;
  paid_at: string | null;
  refunded_amount: number | string | null;
  charge_model: string | null;
  disputed_at: string | null;
  dispute_reason: string | null;
  dispute_status: string | null;
  payment_plan_id?: string | null;
  due_date?: string | null;
};

export async function loadPaymentsLedgerData(
  supabase: SupabaseClient,
  accountId: string,
  options: LedgerFilterOptions = {},
): Promise<{
  rows: PaymentLedgerItem[];
  totalMatching: number;
  summary: PaymentsLedgerSummary;
  available: boolean;
}> {
  try {
    const { start } = resolveLedgerDateWindow(options.range || '30d');

    // Fetch all payments for this account to guarantee accurate metrics & client-side instant filtering
    const paymentRows = await fetchAllPages<DbPaymentRow>((from, to) => {
      let query = supabase
        .from('payments')
        .select(`
          id,
          account_id,
          job_id,
          invoice_id,
          kind,
          label,
          amount,
          status,
          platform_fee,
          fee_rate,
          fee_basis_amount,
          stripe_checkout_session,
          stripe_payment_intent,
          async_payment_pending_at,
          homeowner_phone,
          requested_at,
          paid_at,
          refunded_amount,
          charge_model,
          disputed_at,
          dispute_reason,
          dispute_status,
          payment_plan_id,
          due_date
        `)
        .eq('account_id', accountId)
        .order('requested_at', { ascending: false });

      if (start) {
        query = query.gte('requested_at', start);
      }

      return query.range(from, to);
    });

    // Batch lookup Job details & Invoices
    const jobIds = [...new Set(paymentRows.map((p) => p.job_id).filter(Boolean))];
    const invoiceIds = [...new Set(paymentRows.map((p) => p.invoice_id).filter(Boolean))];

    const [jobsRes, invoicesRes] = await Promise.all([
      jobIds.length > 0
        ? supabase.from('jobs').select('id, ref, client_name').in('id', jobIds)
        : Promise.resolve({ data: [] }),
      invoiceIds.length > 0
        ? supabase.from('invoices').select('id, ref').in('id', invoiceIds)
        : Promise.resolve({ data: [] }),
    ]);

    const jobMap = new Map<string, { ref: string; client_name: string }>();
    for (const j of jobsRes.data ?? []) {
      jobMap.set(j.id, { ref: j.ref ?? '—', client_name: j.client_name ?? 'Customer' });
    }

    const invoiceMap = new Map<string, string>();
    for (const inv of invoicesRes.data ?? []) {
      invoiceMap.set(inv.id, inv.ref ?? '—');
    }

    let grossRevenueCents = 0;
    let netRevenueCents = 0;
    let totalFeesCents = 0;
    let totalRefundsCents = 0;
    let paidCount = 0;
    let processingCount = 0;
    let pendingAchCount = 0;
    let failedCount = 0;
    let disputedCount = 0;
    let achSavingsEstimatedCents = 0;

    const mappedItems: PaymentLedgerItem[] = paymentRows.map((row) => {
      const job = jobMap.get(row.job_id);
      const invoiceRef = row.invoice_id ? invoiceMap.get(row.invoice_id) ?? null : null;
      const amountCents = toCents(Number(row.amount) || 0);
      const feeCents = toCents(Number(row.platform_fee) || 0);
      const refundedCents = toCents(Number(row.refunded_amount) || 0);
      const netCents = Math.max(0, amountCents - feeCents - refundedCents);

      const amount = fromCents(amountCents);
      const fee = fromCents(feeCents);
      const refunded = fromCents(refundedCents);
      const net = fromCents(netCents);

      const isPaid = row.status === 'paid';
      const isFailed = row.status === 'failed';
      const isDisputed = row.status === 'disputed' || Boolean(row.disputed_at);
      const isProcessing = row.status === 'processing';
      const isPendingAch = Boolean(row.async_payment_pending_at);

      if (isPaid) {
        grossRevenueCents += amountCents;
        totalFeesCents += feeCents;
        netRevenueCents += netCents;
        totalRefundsCents += refundedCents;
        paidCount++;

        // Estimate ACH savings if transaction >= $500: Card fee would be ~2.9% + 30c ($14.80+), ACH fee is flat $5.
        if (row.charge_model === 'ach' || (amount >= 500 && row.charge_model !== 'card')) {
          const estimatedCardFeeCents = Math.round(amountCents * 0.029) + 30;
          achSavingsEstimatedCents += Math.max(0, estimatedCardFeeCents - 500);
        }
      }

      if (isFailed) failedCount++;
      if (isDisputed) disputedCount++;
      if (isProcessing && !isPendingAch) processingCount++;
      if (isPendingAch) pendingAchCount++;

      // Deduce payment method display
      let method = 'Card';
      if (row.charge_model === 'manual') method = 'Manual / Offline';
      else if (row.charge_model === 'ach' || row.async_payment_pending_at) method = 'ACH Bank Transfer';
      else if (row.charge_model === 'apple_pay') method = 'Apple Pay';
      else if (row.charge_model === 'google_pay') method = 'Google Pay';

      return {
        id: row.id,
        accountId: row.account_id,
        jobId: row.job_id,
        jobRef: job?.ref ?? '—',
        clientName: job?.client_name ?? 'Direct Customer',
        clientPhone: row.homeowner_phone ?? null,
        invoiceId: row.invoice_id,
        invoiceRef,
        kind: row.kind,
        label: row.label || (row.kind === 'deposit' ? 'Deposit Payment' : 'Project Payment'),
        amount,
        platformFee: fee,
        netAmount: net,
        feeRate: row.fee_rate ? Number(row.fee_rate) : null,
        status: row.status,
        paymentMethod: method,
        cardBrand: null,
        cardLast4: null,
        paidAt: row.paid_at,
        requestedAt: row.requested_at,
        refundedAmount: refunded,
        disputedAt: row.disputed_at,
        disputeReason: row.dispute_reason,
        disputeStatus: row.dispute_status,
        chargeModel: row.charge_model,
        stripePaymentIntent: row.stripe_payment_intent,
        stripeCheckoutSession: row.stripe_checkout_session,
        asyncPaymentPendingAt: row.async_payment_pending_at,
      };
    });

    const averageTransaction = paidCount > 0 ? fromCents(Math.round(grossRevenueCents / paidCount)) : 0;

    const summary: PaymentsLedgerSummary = {
      grossRevenue: fromCents(grossRevenueCents),
      netRevenue: fromCents(netRevenueCents),
      totalFees: fromCents(totalFeesCents),
      totalRefunds: fromCents(totalRefundsCents),
      paidCount,
      processingCount,
      pendingAchCount,
      failedCount,
      disputedCount,
      averageTransaction,
      achSavingsEstimated: fromCents(achSavingsEstimatedCents),
    };

    return {
      rows: mappedItems,
      totalMatching: mappedItems.length,
      summary,
      available: true,
    };
  } catch (error) {
    console.error('Failed to load payments ledger data:', error);
    return {
      rows: [],
      totalMatching: 0,
      summary: {
        grossRevenue: 0,
        netRevenue: 0,
        totalFees: 0,
        totalRefunds: 0,
        paidCount: 0,
        processingCount: 0,
        pendingAchCount: 0,
        failedCount: 0,
        disputedCount: 0,
        averageTransaction: 0,
        achSavingsEstimated: 0,
      },
      available: false,
    };
  }
}
