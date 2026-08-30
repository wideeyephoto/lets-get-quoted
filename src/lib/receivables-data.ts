import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPages } from '@/lib/pagination';

export type AgingBucket = 'current' | '1_15' | '16_30' | '31_60' | '60_plus';
export type ReliabilityTier = 'A' | 'B' | 'C';

export type ReceivableItem = {
  id: string;
  source: 'invoice' | 'payment_request';
  jobId: string;
  jobRef: string;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  ref: string;
  title: string;
  amountTotal: number;
  amountPaid: number;
  amountDue: number;
  status: 'draft' | 'sent' | 'signed' | 'overdue' | 'requested' | 'processing';
  createdAt: string;
  dueDate: string | null;
  daysOutstanding: number;
  daysOverdue: number;
  agingBucket: AgingBucket;
  reliabilityTier: ReliabilityTier;
  lastReminderSentAt: string | null;
  remindersCount: number;
  payUrl: string | null;
};

export type ReceivablesSummary = {
  totalOutstanding: number;
  totalOverdue: number;
  currentBucketTotal: number;
  overdue1_15Total: number;
  overdue16_30Total: number;
  overdue31_60Total: number;
  overdue60PlusTotal: number;
  totalReceivablesCount: number;
  overdueCount: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type DbInvoiceRow = {
  id: string;
  ref: string | null;
  job_id: string;
  status: ReceivableItem['status'];
  total: number | string;
  discount_percent: number | string | null;
  tax_rate: number | string | null;
  created_at: string;
};

type DbPendingPaymentRow = {
  id: string;
  job_id: string;
  invoice_id: string | null;
  kind: string;
  label: string | null;
  amount: number | string;
  status: ReceivableItem['status'];
  requested_at: string;
  homeowner_phone: string | null;
  due_date: string | null;
};

type DbJobRow = {
  id: string;
  ref: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
};

export async function loadReceivablesData(
  supabase: SupabaseClient,
  accountId: string,
): Promise<{
  receivables: ReceivableItem[];
  summary: ReceivablesSummary;
  available: boolean;
}> {
  try {
    const now = Date.now();

    // 1. Fetch all unpaid/open invoices for this account
    const [invoices, pendingPayments, jobsRes] = await Promise.all([
      fetchAllPages<DbInvoiceRow>((from, to) =>
        supabase
          .from('invoices')
          .select('id, ref, job_id, status, total, discount_percent, tax_rate, created_at')
          .eq('account_id', accountId)
          .in('status', ['sent', 'signed', 'draft'])
          .gt('total', 0)
          .order('created_at', { ascending: false })
          .range(from, to),
      ),
      fetchAllPages<DbPendingPaymentRow>((from, to) =>
        supabase
          .from('payments')
          .select('id, job_id, invoice_id, kind, label, amount, status, requested_at, homeowner_phone, due_date')
          .eq('account_id', accountId)
          .in('status', ['requested', 'processing'])
          .gt('amount', 0)
          .order('requested_at', { ascending: false })
          .range(from, to),
      ),
      fetchAllPages<DbJobRow>((from, to) =>
        supabase
          .from('jobs')
          .select('id, ref, client_name, client_phone, client_email')
          .eq('account_id', accountId)
          .range(from, to),
      ),
    ]);

    const jobMap = new Map<string, { ref: string; client_name: string; client_phone: string | null; client_email: string | null }>();
    for (const j of jobsRes) {
      jobMap.set(j.id, {
        ref: j.ref ?? '—',
        client_name: j.client_name ?? 'Customer',
        client_phone: j.client_phone ?? null,
        client_email: j.client_email ?? null,
      });
    }

    const items: ReceivableItem[] = [];
    const processedInvoiceIds = new Set<string>();

    for (const inv of invoices) {
      processedInvoiceIds.add(inv.id);
      const job = jobMap.get(inv.job_id);
      const total = Number(inv.total) || 0;
      const createdMs = new Date(inv.created_at).getTime();
      const daysOutstanding = Math.max(0, Math.floor((now - createdMs) / 86400000));
      const daysOverdue = Math.max(0, daysOutstanding - 14);

      let agingBucket: AgingBucket = 'current';
      if (daysOverdue > 60) agingBucket = '60_plus';
      else if (daysOverdue > 30) agingBucket = '31_60';
      else if (daysOverdue > 15) agingBucket = '16_30';
      else if (daysOverdue > 0) agingBucket = '1_15';

      let reliabilityTier: ReliabilityTier = 'A';
      if (daysOverdue > 15) reliabilityTier = 'C';
      else if (daysOverdue > 0) reliabilityTier = 'B';

      items.push({
        id: inv.id,
        source: 'invoice',
        jobId: inv.job_id,
        jobRef: job?.ref ?? '—',
        clientName: job?.client_name ?? 'Customer',
        clientPhone: job?.client_phone ?? null,
        clientEmail: job?.client_email ?? null,
        ref: inv.ref ?? `INV-${inv.id.slice(0, 6)}`,
        title: `Invoice ${inv.ref ?? ''}`,
        amountTotal: total,
        amountPaid: 0,
        amountDue: total,
        status: daysOverdue > 0 ? 'overdue' : inv.status,
        createdAt: inv.created_at,
        dueDate: new Date(createdMs + 14 * 86400000).toISOString(),
        daysOutstanding,
        daysOverdue,
        agingBucket,
        reliabilityTier,
        lastReminderSentAt: null,
        remindersCount: 0,
        payUrl: `/invoice/${inv.id}`,
      });
    }

    // Add standalone payment requests
    for (const pay of pendingPayments) {
      if (pay.invoice_id && processedInvoiceIds.has(pay.invoice_id)) {
        continue;
      }

      const job = jobMap.get(pay.job_id);
      const amount = Number(pay.amount) || 0;
      const createdMs = new Date(pay.requested_at).getTime();
      const daysOutstanding = Math.max(0, Math.floor((now - createdMs) / 86400000));
      const daysOverdue = Math.max(0, daysOutstanding - 7);

      let agingBucket: AgingBucket = 'current';
      if (daysOverdue > 60) agingBucket = '60_plus';
      else if (daysOverdue > 30) agingBucket = '31_60';
      else if (daysOverdue > 15) agingBucket = '16_30';
      else if (daysOverdue > 0) agingBucket = '1_15';

      let reliabilityTier: ReliabilityTier = 'A';
      if (daysOverdue > 15) reliabilityTier = 'C';
      else if (daysOverdue > 0) reliabilityTier = 'B';

      items.push({
        id: pay.id,
        source: 'payment_request',
        jobId: pay.job_id,
        jobRef: job?.ref ?? '—',
        clientName: job?.client_name ?? 'Customer',
        clientPhone: pay.homeowner_phone ?? job?.client_phone ?? null,
        clientEmail: job?.client_email ?? null,
        ref: `PAY-${pay.id.slice(0, 6).toUpperCase()}`,
        title: pay.label || `${pay.kind} payment request`,
        amountTotal: amount,
        amountPaid: 0,
        amountDue: amount,
        status: daysOverdue > 0 ? 'overdue' : pay.status,
        createdAt: pay.requested_at,
        dueDate: pay.due_date ?? new Date(createdMs + 7 * 86400000).toISOString(),
        daysOutstanding,
        daysOverdue,
        agingBucket,
        reliabilityTier,
        lastReminderSentAt: null,
        remindersCount: 0,
        payUrl: `/pay/${pay.id}`,
      });
    }

    // Compute Aging Bucket totals
    let currentBucketTotal = 0;
    let overdue1_15Total = 0;
    let overdue16_30Total = 0;
    let overdue31_60Total = 0;
    let overdue60PlusTotal = 0;
    let overdueCount = 0;

    for (const item of items) {
      if (item.agingBucket === 'current') {
        currentBucketTotal += item.amountDue;
      } else if (item.agingBucket === '1_15') {
        overdue1_15Total += item.amountDue;
        overdueCount++;
      } else if (item.agingBucket === '16_30') {
        overdue16_30Total += item.amountDue;
        overdueCount++;
      } else if (item.agingBucket === '31_60') {
        overdue31_60Total += item.amountDue;
        overdueCount++;
      } else if (item.agingBucket === '60_plus') {
        overdue60PlusTotal += item.amountDue;
        overdueCount++;
      }
    }

    const totalOutstanding = round2(
      currentBucketTotal +
      overdue1_15Total +
      overdue16_30Total +
      overdue31_60Total +
      overdue60PlusTotal,
    );

    const totalOverdue = round2(
      overdue1_15Total +
      overdue16_30Total +
      overdue31_60Total +
      overdue60PlusTotal,
    );

    const summary: ReceivablesSummary = {
      totalOutstanding,
      totalOverdue,
      currentBucketTotal: round2(currentBucketTotal),
      overdue1_15Total: round2(overdue1_15Total),
      overdue16_30Total: round2(overdue16_30Total),
      overdue31_60Total: round2(overdue31_60Total),
      overdue60PlusTotal: round2(overdue60PlusTotal),
      totalReceivablesCount: items.length,
      overdueCount,
    };

    return {
      receivables: items,
      summary,
      available: true,
    };
  } catch (error) {
    console.error('loadReceivablesData failed:', error);
    return {
      receivables: [],
      summary: {
        totalOutstanding: 0,
        totalOverdue: 0,
        currentBucketTotal: 0,
        overdue1_15Total: 0,
        overdue16_30Total: 0,
        overdue31_60Total: 0,
        overdue60PlusTotal: 0,
        totalReceivablesCount: 0,
        overdueCount: 0,
      },
      available: false,
    };
  }
}
