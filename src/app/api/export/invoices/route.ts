import { NextResponse } from 'next/server';
import { requireOwnerContext } from '@/lib/auth';
import { buildInvoicesCsv } from '@/lib/data-export';

export async function GET() {
  const { supabase, accountId } = await requireOwnerContext();
  const csv = await buildInvoicesCsv(supabase, accountId);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="letsgetquoted-invoices.csv"',
    },
  });
}
