import { NextResponse } from 'next/server';
import { requireOwnerContext } from '@/lib/auth';
import {
  buildProfitAndLoss,
  buildProfitAndLossCsv,
  buildScheduleCWorksheet,
  buildScheduleCCsv,
  build1099PrepList,
  build1099Csv,
} from '@/lib/tax-reports';

export async function GET(request: Request) {
  const { supabase, accountId } = await requireOwnerContext();

  const { searchParams } = new URL(request.url);
  const yearParam = parseInt(searchParams.get('year') ?? '', 10);
  const year = Number.isFinite(yearParam) ? yearParam : new Date().getFullYear();
  const type = searchParams.get('type') ?? 'pl';

  let csv: string;
  let filename: string;

  if (type === 'schedule-c') {
    const pl = await buildProfitAndLoss(supabase, accountId, year);
    csv = buildScheduleCCsv(buildScheduleCWorksheet(pl));
    filename = `letsgetquoted-schedule-c-worksheet-${year}.csv`;
  } else if (type === '1099') {
    const list = await build1099PrepList(supabase, accountId, year);
    csv = build1099Csv(list);
    filename = `letsgetquoted-1099-prep-${year}.csv`;
  } else {
    const pl = await buildProfitAndLoss(supabase, accountId, year);
    csv = buildProfitAndLossCsv(pl);
    filename = `letsgetquoted-profit-and-loss-${year}.csv`;
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
