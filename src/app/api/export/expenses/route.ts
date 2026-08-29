import { NextResponse } from 'next/server';
import { requireOfficeContext } from '@/lib/auth';
import { listAccountExpenses, generateExpensesCsv, type ExpenseFilters } from '@/lib/expense-ledger';
import type { CostType } from '@/lib/jobs';
import type { CostSource } from '@/lib/cost-truth';

export async function GET(request: Request) {
  const { supabase, accountId } = await requireOfficeContext('reports.read');

  const { searchParams } = new URL(request.url);
  const typeParam = searchParams.get('type') as CostType | 'all' | null;
  const sourceParam = searchParams.get('source') as CostSource | 'all' | null;
  const jobId = searchParams.get('jobId') || undefined;
  const query = searchParams.get('query') || undefined;
  const dateFrom = searchParams.get('dateFrom') || undefined;
  const dateTo = searchParams.get('dateTo') || undefined;

  const filters: ExpenseFilters = {
    type: typeParam ?? 'all',
    source: sourceParam ?? 'all',
    jobId,
    query,
    dateFrom,
    dateTo,
    limit: 1000,
  };

  const { rows } = await listAccountExpenses(supabase, accountId, filters);
  const csv = generateExpensesCsv(rows);

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
