import type { SupabaseClient } from '@supabase/supabase-js';

const INVOICE_STATUS_DISPLAY: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  signed: 'Signed',
  paid: 'Paid',
  void: 'Void',
};

function csvEscape(value: string): string {
  // Wrap in quotes and escape internal quotes so commas/quotes in
  // descriptions can't break the CSV structure.
  return `"${value.replace(/"/g, '""')}"`;
}

function formatCsvDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

// QuickBooks-importable CSV: one row per invoice line item (income) and one
// row per cost (expense, negative amount). Matches the columns QuickBooks'
// generic transaction/journal CSV import expects.
export async function buildQuickBooksCsv(supabase: SupabaseClient, accountId: string): Promise<string> {
  const rows: string[][] = [['InvoiceNo', 'Customer', 'InvoiceDate', 'ItemDescription', 'ItemAmount', 'JobStatus']];

  const { data: invoices, error: invoicesError } = await supabase
    .from('invoices')
    .select('ref, status, created_at, job:jobs(client_name), invoice_items(description, amount)')
    .eq('account_id', accountId);

  if (invoicesError) {
    throw invoicesError;
  }

  for (const invoice of invoices ?? []) {
    const job = Array.isArray(invoice.job) ? invoice.job[0] : invoice.job;
    const customer = job?.client_name ?? 'Unknown client';
    const date = formatCsvDate(invoice.created_at as string);
    const status = INVOICE_STATUS_DISPLAY[invoice.status as string] ?? invoice.status;

    for (const item of (invoice.invoice_items ?? []) as { description: string; amount: number }[]) {
      rows.push([invoice.ref as string, customer, date, csvEscape(item.description), String(item.amount), status]);
    }
  }

  const { data: costs, error: costsError } = await supabase
    .from('costs')
    .select('category, description, amount, job:jobs(ref, client_name)')
    .eq('account_id', accountId);

  if (costsError) {
    throw costsError;
  }

  for (const cost of costs ?? []) {
    const job = Array.isArray(cost.job) ? cost.job[0] : cost.job;
    const jobRef = job?.ref ?? 'UNKNOWN';
    const customer = job?.client_name ?? 'Unknown client';

    rows.push([
      `EXP-${jobRef}`,
      customer,
      '',
      csvEscape(`${cost.category}: ${cost.description}`),
      String(-Number(cost.amount)),
      'Expense',
    ]);
  }

  return rows.map((row) => row.join(',')).join('\n');
}
