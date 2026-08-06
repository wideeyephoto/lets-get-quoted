import { NextResponse } from 'next/server';
import { requireOwnerContext } from '@/lib/auth';
import { buildInsights, resolvePeriod } from '@/lib/insights';
import { buildInsightsCsv, buildInsightsPdf } from '@/lib/insights-export';

// Download the current Insights view as a file. Mirrors /api/export/tax: owner
// context first (tenant scope + auth), the same window/from/to the page reads so
// the export matches what's on screen, then a format switch to CSV or PDF with an
// attachment disposition. pdfkit needs Node, so the handler is pinned there.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { supabase, accountId } = await requireOwnerContext();

  const { searchParams } = new URL(request.url);
  const period = resolvePeriod({
    window: searchParams.get('window') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  });
  const format = (searchParams.get('format') ?? 'pdf').toLowerCase();

  // business_name / company_name only to title the report; arrival analytics are
  // not part of any exported section, so we skip that admin round trip and tell
  // buildInsights there's no arrival data rather than fetching it.
  const [{ data: account }, { data: siteRow }] = await Promise.all([
    supabase.from('accounts').select('arrival_updates_enabled, business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);

  const insights = await buildInsights(supabase, accountId, period, {
    arrivalUpdatesOn: Boolean(account?.arrival_updates_enabled),
    hasArrivalData: false,
  });

  const businessName = (siteRow?.company_name as string) || (account?.business_name as string) || 'Your business';
  const generatedLabel = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const stamp = new Date().toISOString().slice(0, 10);
  const meta = { businessName, generatedLabel };

  if (format === 'csv') {
    const csv = buildInsightsCsv(insights, meta);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="letsgetquoted-business-performance-${stamp}.csv"`,
      },
    });
  }

  const pdf = await buildInsightsPdf(insights, meta);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="letsgetquoted-business-performance-${stamp}.pdf"`,
    },
  });
}
