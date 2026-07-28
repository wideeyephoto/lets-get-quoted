import { NextResponse } from 'next/server';
import { requireOwnerContext } from '@/lib/auth';
import { buildServicesCsv } from '@/lib/data-export';

export async function GET() {
  const { supabase, accountId } = await requireOwnerContext();
  const csv = await buildServicesCsv(supabase, accountId);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="letsgetquoted-price-book.csv"',
    },
  });
}
