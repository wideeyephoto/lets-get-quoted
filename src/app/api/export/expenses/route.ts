import { NextResponse } from 'next/server';
import { requireOfficeContext } from '@/lib/auth';
import { listAllAccountExpenses, generateExpensesCsv, type ExpenseFilters } from '@/lib/expense-ledger';
import type { CostType } from '@/lib/jobs';
import type { CostSource } from '@/lib/cost-truth';

export async function GET(request: Request) {
  const { supabase, accountId, accountTimeZone } = await requireOfficeContext('reports.read');

  const { searchParams } = new URL(request.url);
  const typeParam = searchParams.get('type') as CostType | 'all' | null;
  const sourceParam = searchParams.get('source') as CostSource | 'all' | null;
  const jobId = searchParams.get('jobId') || undefined;
  const supplier = searchParams.get('supplier') || undefined;
  const query = searchParams.get('query') || undefined;
  const dateFrom = searchParams.get('dateFrom') || undefined;
  const dateTo = searchParams.get('dateTo') || undefined;

  const filters: ExpenseFilters = {
    type: typeParam ?? 'all',
    source: sourceParam ?? 'all',
    jobId,
    supplier: supplier && supplier !== 'all' ? supplier : undefined,
    query,
    dateFrom,
    dateTo,
  };

  // Fetch all matching rows with zero silent truncation
  const { rows } = await listAllAccountExpenses(supabase, accountId, filters);

  const csv = generateExpensesCsv(rows, accountTimeZone);

  const dateTag = new Date().toISOString().slice(0, 10);
  const filename = `letsgetquoted-expenses-ledger-${dateTag}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
