import type { SupabaseClient } from '@supabase/supabase-js';
import type { CostType } from '@/lib/jobs';

// -- Profit & Loss ---------------------------------------------------------
// Cash-basis, which is how nearly all sole proprietors/small contractors
// file: revenue is counted when the homeowner's payment actually clears
// (payments.paid_at), not when a job is quoted or an invoice is sent.

export type ProfitAndLoss = {
  year: number;
  revenue: number;
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
  year: number
): Promise<ProfitAndLoss> {
  const { start, end } = yearRange(year);

  const [{ data: payments, error: paymentsError }, { data: costs, error: costsError }] = await Promise.all([
    supabase
      .from('payments')
      .select('amount, platform_fee, paid_at')
      .eq('account_id', accountId)
      .eq('status', 'paid')
      .gte('paid_at', start)
      .lt('paid_at', end),
    supabase
      .from('costs')
      .select('type, amount, created_at')
      .eq('account_id', accountId)
      .gte('created_at', start)
      .lt('created_at', end),
  ]);

  if (paymentsError) throw paymentsError;
  if (costsError) throw costsError;

  const monthly = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: new Date(year, i, 1).toLocaleDateString('en-US', { month: 'short' }),
    revenue: 0,
    expenses: 0,
    net: 0,
  }));

  let revenue = 0;
  let platformFees = 0;
  for (const p of payments ?? []) {
    const amount = Number(p.amount) || 0;
    revenue += amount;
    platformFees += Number(p.platform_fee) || 0;
    const monthIndex = new Date(p.paid_at as string).getMonth();
    monthly[monthIndex].revenue += amount;
    monthly[monthIndex].expenses += Number(p.platform_fee) || 0;
  }

  const expensesByCategory = { materials: 0, labor: 0, subcontractors: 0, receipts: 0, other: 0, platformFees };
  for (const c of costs ?? []) {
    const amount = Number(c.amount) || 0;
    const monthIndex = new Date(c.created_at as string).getMonth();
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

  monthly.forEach((m) => {
    m.net = m.revenue - m.expenses;
  });

  const totalExpenses = Object.values(expensesByCategory).reduce((sum, v) => sum + v, 0);
  const netProfit = revenue - totalExpenses;

  return { year, revenue, expensesByCategory, totalExpenses, netProfit, monthly };
}

// -- Schedule C worksheet ---------------------------------------------------
// A helper worksheet mapping this app's expense categories to the IRS
// Schedule C (Form 1040) lines they most commonly land on. This is NOT an
// official IRS form — it's a starting point for the contractor or their
// accountant to fill out the real thing.

export type ScheduleCLine = { line: string; label: string; amount: number };

export function buildScheduleCWorksheet(pl: ProfitAndLoss): ScheduleCLine[] {
  return [
    { line: 'Line 1', label: 'Gross receipts (total collected from customers)', amount: pl.revenue },
    { line: 'Line 10', label: 'Commissions and fees (payment processing)', amount: pl.expensesByCategory.platformFees },
    { line: 'Line 11', label: 'Contract labor (subcontractors paid)', amount: pl.expensesByCategory.subcontractors },
    {
      line: 'Line 22',
      label: 'Supplies and materials',
      amount: pl.expensesByCategory.materials + pl.expensesByCategory.receipts,
    },
    { line: 'Line 26', label: 'Wages (crew paid as labor, if not 1099)', amount: pl.expensesByCategory.labor },
    { line: 'Line 27a', label: 'Other expenses', amount: pl.expensesByCategory.other },
  ];
}

// -- 1099-NEC prep -----------------------------------------------------------
// Flags subcontractors paid $600+ in the tax year, since the IRS requires a
// 1099-NEC for each. We only track a free-text supplier name today (no
// TIN/W-9 on file), so this is a prep list to work from — not a filed form.

export type SubcontractorPayout = { supplier: string; total: number; needs1099: boolean };

export async function build1099PrepList(
  supabase: SupabaseClient,
  accountId: string,
  year: number
): Promise<SubcontractorPayout[]> {
  const { start, end } = yearRange(year);

  const { data, error } = await supabase
    .from('costs')
    .select('supplier, amount')
    .eq('account_id', accountId)
    .eq('type', 'sub')
    .gte('created_at', start)
    .lt('created_at', end);

  if (error) throw error;

  const totals = new Map<string, number>();
  for (const row of data ?? []) {
    const name = (row.supplier as string | null)?.trim() || 'Unnamed subcontractor';
    totals.set(name, (totals.get(name) ?? 0) + (Number(row.amount) || 0));
  }

  return Array.from(totals.entries())
    .map(([supplier, total]) => ({ supplier, total, needs1099: total >= 600 }))
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

export function build1099Csv(list: SubcontractorPayout[]): string {
  const rows: string[][] = [['Subcontractor', 'Total Paid', 'May Need 1099-NEC']];
  for (const s of list) rows.push([csvEscape(s.supplier), s.total.toFixed(2), s.needs1099 ? 'Yes' : 'No']);
  return rows.map((row) => row.join(',')).join('\n');
}
