import { requireOfficeContext } from '@/lib/auth';
import { listJobs } from '@/lib/jobs';
import { loadPaymentsLedgerData } from '@/lib/payments-ledger-data';
import { loadReceivablesData } from '@/lib/receivables-data';
import { loadStripePayoutsOverview } from '@/lib/payouts-data';
import { loadRevenueAnalyticsData } from '@/lib/revenue-analytics-data';
import RevenuePaymentsScreen from './RevenuePaymentsScreen';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Revenue & Payments · Let’s Get Quoted',
  description: 'Reconciled revenue, client transactions, aging invoices, and bank payouts.',
};

export default async function PaymentsRevenuePage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  const { supabase, accountId } = await requireOfficeContext('reports.read');

  const selectedRange = searchParams.range || '30d';

  const [ledgerRes, receivablesRes, payoutsRes, analyticsRes, jobsRes] = await Promise.all([
    loadPaymentsLedgerData(supabase, accountId, { range: selectedRange as any }),
    loadReceivablesData(supabase, accountId),
    loadStripePayoutsOverview(supabase, accountId),
    loadRevenueAnalyticsData(supabase, accountId),
    listJobs(supabase, accountId),
  ]);

  const mappedJobs = jobsRes.map((j) => ({
    id: j.id,
    ref: j.ref,
    clientName: j.client_name,
  }));

  return (
    <RevenuePaymentsScreen
      initialPayments={ledgerRes.rows}
      ledgerSummary={ledgerRes.summary}
      receivables={receivablesRes.receivables}
      receivablesSummary={receivablesRes.summary}
      payouts={payoutsRes}
      analytics={analyticsRes}
      jobs={mappedJobs}
      selectedRange={selectedRange}
    />
  );
}
