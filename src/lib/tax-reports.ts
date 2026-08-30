import type { SupabaseClient } from '@supabase/supabase-js';
import type { CostType } from '@/lib/jobs';
import { fetchAllPages } from '@/lib/pagination';

// -- Profit & Loss ---------------------------------------------------------
// Cash-basis, which is how nearly all sole proprietors/small contractors
// file: revenue is counted when the homeowner's payment actually clears
// (payments.paid_at), not when a job is quoted or an invoice is sent.
// Refunds are netted against gross receipts.

export type ProfitAndLoss = {
  year: number;
  grossRevenue: number;
  refunds: number;
  revenue: number; // Net revenue (grossRevenue - refunds)
  expensesByCategory: {
    materials: number;
    labor: number;
    subcontractors: number;
    receipts: number;
    other: number;
    platformFees: number;
  };
  totalExpenses: number;
  netProfit: number;
  monthly: { month: number; label: string; revenue: number; expenses: number; net: number }[];
};

// Currency aggregates land on tax forms, so round every total to whole cents —
// summing numeric(12,2) values as JS floats can otherwise leave sub-cent artifacts
// (0.1 + 0.2 = 0.30000000000000004).
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// The rows buildProfitAndLoss fetches. Kept loose (numeric columns arrive as
// strings from the driver) so the pure core can be exercised directly in tests.
export type PaidPaymentRow = {
  amount: number | string;
  platform_fee: number | string | null;
  paid_at: string;
  status?: string | null;
  refunded_amount?: number | string | null;
};
export type CostRow = { type: string | null; amount: number | string | null; created_at: string };
export type SubcontractorCostRow = { supplier: string | null; amount: number | string | null };

function yearRange(year: number): { start: string; end: string } {
  return { start: `${year}-01-01T00:00:00.000Z`, end: `${year + 1}-01-01T00:00:00.000Z` };
}

export async function getAvailableTaxYears(supabase: SupabaseClient, accountId: string): Promise<number[]> {
  const currentYear = new Date().getFullYear();
  const { data: account } = await supabase.from('accounts').select('created_at').eq('id', accountId).single();
  const startYear = account?.created_at ? new Date(account.created_at as string).getFullYear() : currentYear;
  const years: number[] = [];
  for (let y = currentYear; y >= startYear; y--) years.push(y);
  return years.length ? years : [currentYear];
}

export async function buildProfitAndLoss(
  supabase: SupabaseClient,
  accountId: string,
  year: number,
): Promise<ProfitAndLoss> {
  const { start, end } = yearRange(year);

  // Use high-volume pagination to guarantee zero row loss on large workspaces (>1,000 records)
  const [payments, costs] = await Promise.all([
    fetchAllPages<PaidPaymentRow>((from, to) =>
      supabase
        .from('payments')
        .select('amount, platform_fee, paid_at, status, refunded_amount')
        .eq('account_id', accountId)
        .in('status', ['paid', 'refunded', 'partially_refunded'])
        .gte('paid_at', start)
        .lt('paid_at', end)
        .order('paid_at', { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<CostRow>((from, to) =>
      supabase
        .from('costs')
        .select('type, amount, created_at')
        .eq('account_id', accountId)
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: true })
        .range(from, to),
    ),
  ]);

  return computeProfitAndLoss(year, payments, costs);
}

// The pure P&L aggregation over already-fetched rows. Month bucketing uses UTC
// (getUTCMonth) to match the UTC year boundaries in yearRange — otherwise a
// payment in the first hours of a month (UTC) would, on a non-UTC server, be
// attributed to the previous month's row while still counting in this year's
// total, so the monthly chart wouldn't reconcile with the annual figures.
export function computeProfitAndLoss(year: number, payments: PaidPaymentRow[], costs: CostRow[]): ProfitAndLoss {
  const monthly = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: new Date(Date.UTC(year, i, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
    revenue: 0,
    expenses: 0,
    net: 0,
  }));

  let grossRevenue = 0;
  let refunds = 0;
  let platformFees = 0;

  for (const p of payments) {
    const rawAmount = Number(p.amount) || 0;
    const fee = Number(p.platform_fee) || 0;
    const refunded = Number(p.refunded_amount) || (p.status === 'refunded' ? rawAmount : 0);

    grossRevenue += rawAmount;
    refunds += refunded;
    platformFees += fee;

    const netPayment = rawAmount - refunded;
    const monthIndex = new Date(p.paid_at).getUTCMonth();
    monthly[monthIndex].revenue += netPayment;
    monthly[monthIndex].expenses += fee;
  }

  const netRevenue = round2(grossRevenue - refunds);

  const expensesByCategory = { materials: 0, labor: 0, subcontractors: 0, receipts: 0, other: 0, platformFees: 0 };
  for (const c of costs) {
    const amount = Number(c.amount) || 0;
    const monthIndex = new Date(c.created_at).getUTCMonth();
    monthly[monthIndex].expenses += amount;

    switch (c.type as CostType) {
      case 'material':
        expensesByCategory.materials += amount;
        break;
      case 'labor':
        expensesByCategory.labor += amount;
        break;
      case 'sub':
        expensesByCategory.subcontractors += amount;
        break;
      case 'receipt':
        expensesByCategory.receipts += amount;
        break;
      default:
        expensesByCategory.other += amount;
    }
  }
  expensesByCategory.platformFees = platformFees;

  // Round each currency aggregate to whole cents.
  (Object.keys(expensesByCategory) as (keyof typeof expensesByCategory)[]).forEach((k) => {
    expensesByCategory[k] = round2(expensesByCategory[k]);
  });
  grossRevenue = round2(grossRevenue);
  refunds = round2(refunds);
  const totalExpenses = round2(Object.values(expensesByCategory).reduce((sum, v) => sum + v, 0));
  const netProfit = round2(netRevenue - totalExpenses);
  monthly.forEach((m) => {
    m.revenue = round2(m.revenue);
    m.expenses = round2(m.expenses);
    m.net = round2(m.revenue - m.expenses);
  });

  return {
    year,
    grossRevenue,
    refunds,
    revenue: netRevenue,
    expensesByCategory,
    totalExpenses,
    netProfit,
    monthly,
  };
}

// -- Schedule C worksheet ---------------------------------------------------
// A helper worksheet mapping this app's expense categories to the IRS
// Schedule C (Form 1040) lines they most commonly land on. This is NOT an
// official IRS form — it's a starting point for the contractor or their
// accountant to fill out the real thing.

export type ScheduleCLine = { line: string; label: string; amount: number };

export function buildScheduleCWorksheet(pl: ProfitAndLoss): ScheduleCLine[] {
  const suppliesAndMaterials = round2(pl.expensesByCategory.materials + pl.expensesByCategory.receipts);
  return [
    { line: 'Line 1', label: 'Gross receipts or sales (total collected from customers)', amount: pl.grossRevenue ?? pl.revenue },
    { line: 'Line 2', label: 'Returns and allowances (refunds)', amount: pl.refunds ?? 0 },
    { line: 'Line 3', label: 'Balance (gross receipts minus returns)', amount: pl.revenue },
    { line: 'Line 10', label: 'Commissions and fees (payment processing)', amount: pl.expensesByCategory.platformFees },
    { line: 'Line 11', label: 'Contract labor (subcontractors paid)', amount: pl.expensesByCategory.subcontractors },
    { line: 'Line 22', label: 'Supplies and materials', amount: suppliesAndMaterials },
    { line: 'Line 26', label: 'Wages (crew paid as labor, if not 1099)', amount: pl.expensesByCategory.labor },
    { line: 'Line 27a', label: 'Other expenses', amount: pl.expensesByCategory.other },
    { line: 'Line 28', label: 'Total expenses', amount: pl.totalExpenses },
    { line: 'Line 31', label: 'Net profit or (loss)', amount: pl.netProfit },
  ];
}

// -- 1099-NEC prep -----------------------------------------------------------
// Flags subcontractors whose logged costs meet or exceed the IRS 1099-NEC filing
// threshold for the given tax year ($600 for tax years <= 2025; $2,000 for 2026;
// indexed for inflation in subsequent years).
//
// NOTE ON CASH VS COST: We currently aggregate from logged job costs (costs table),
// not a settled cash disbursement ledger. This is an estimate / prep list to help
// contractors identify payees requiring Form 1099-NEC and collect signed W-9s
// (legal name, address, tax classification, and TIN) ahead of filing.

export type SubcontractorCostRow = {
  supplier: string | null;
  amount: number | string | null;
  crew_id?: string | null;
  crew_name?: string | null;
};

export type SubcontractorPayout = {
  supplier: string;
  crewId?: string | null;
  total: number;
  needs1099: boolean;
};

/**
 * Resolves the IRS 1099-NEC nonemployee compensation filing threshold for a given tax year.
 * - Tax years <= 2025: $600 statutory threshold
 * - Tax year 2026: $2,000 statutory threshold (updated under IRS rules)
 * - Tax years > 2026: Base $2,000 threshold subject to statutory IRS annual inflation adjustments
 */
export function irs1099NecThresholdForYear(year: number): number {
  if (!Number.isFinite(year) || year <= 2025) {
    return 600;
  }
  if (year === 2026) {
    return 2000;
  }
  // Future years are subject to annual IRS inflation adjustments based on the $2,000 baseline.
  // Until specific future inflation index tables are codified, return the $2,000 statutory baseline.
  return 2000;
}

// Retained for backward-compatibility with legacy references.
export const IRS_1099_NEC_LEGACY_THRESHOLD = 600;
export const IRS_1099_NEC_THRESHOLD = 600;

export async function build1099PrepList(
  supabase: SupabaseClient,
  accountId: string,
  year: number,
): Promise<SubcontractorPayout[]> {
  const { start, end } = yearRange(year);
  const threshold = irs1099NecThresholdForYear(year);

  // Paginated retrieval of all subcontractor costs
  const rows = await fetchAllPages<SubcontractorCostRow>((from, to) =>
    supabase
      .from('costs')
      .select('supplier, amount, crew_id, crew_name')
      .eq('account_id', accountId)
      .eq('type', 'sub')
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: true })
      .range(from, to),
  );

  return aggregateSubcontractorPayouts(rows, threshold);
}

// Pure aggregation for the 1099 prep list: sums by stable crew_id (if present) or
// supplier name, eliminating name fragmentation for assigned subcontractors.
export function aggregateSubcontractorPayouts(
  rows: SubcontractorCostRow[],
  threshold: number = IRS_1099_NEC_THRESHOLD,
): SubcontractorPayout[] {
  type Grouping = { supplier: string; crewId: string | null; total: number };
  const groups = new Map<string, Grouping>();

  for (const row of rows) {
    const rawSupplier = (row.supplier ?? '').trim();
    const crewName = (row.crew_name ?? '').trim();
    const crewId = row.crew_id ? String(row.crew_id).trim() : null;

    const displayName = crewName || rawSupplier || 'Unnamed subcontractor';
    const groupKey = crewId ? `crew:${crewId}` : `name:${displayName.toLowerCase()}`;

    const existing = groups.get(groupKey);
    const amount = Number(row.amount) || 0;

    if (existing) {
      existing.total += amount;
      if (!existing.supplier || existing.supplier === 'Unnamed subcontractor') {
        existing.supplier = displayName;
      }
    } else {
      groups.set(groupKey, {
        supplier: displayName,
        crewId,
        total: amount,
      });
    }
  }

  return Array.from(groups.values())
    .map((g) => {
      const total = round2(g.total);
      return {
        supplier: g.supplier,
        crewId: g.crewId,
        total,
        needs1099: total >= threshold,
      };
    })
    .sort((a, b) => b.total - a.total);
}

// -- CSV exports -------------------------------------------------------------

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildProfitAndLossCsv(pl: ProfitAndLoss): string {
  const rows: string[][] = [['Month', 'Revenue', 'Expenses', 'Net Profit']];
  for (const m of pl.monthly) rows.push([m.label, m.revenue.toFixed(2), m.expenses.toFixed(2), m.net.toFixed(2)]);
  rows.push(['Total', pl.revenue.toFixed(2), pl.totalExpenses.toFixed(2), pl.netProfit.toFixed(2)]);
  return rows.map((row) => row.join(',')).join('\n');
}

export function buildScheduleCCsv(lines: ScheduleCLine[]): string {
  const rows: string[][] = [['Schedule C Line', 'Category', 'Amount']];
  for (const l of lines) rows.push([l.line, csvEscape(l.label), l.amount.toFixed(2)]);
  return rows.map((row) => row.join(',')).join('\n');
}

export function build1099Csv(list: SubcontractorPayout[], year?: number): string {
  const yr = year ? year : new Date().getFullYear();
  const threshold = irs1099NecThresholdForYear(yr);
  const rows: string[][] = [['Subcontractor', 'Total Estimated Cost', 'May Need 1099-NEC', 'IRS Threshold', 'Tax Year']];
  for (const s of list) {
    rows.push([
      csvEscape(s.supplier),
      s.total.toFixed(2),
      s.needs1099 ? 'Yes' : 'No',
      `$${threshold.toFixed(2)}`,
      String(yr),
    ]);
  }
  return rows.map((row) => row.join(',')).join('\n');
}
