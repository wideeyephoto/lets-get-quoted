import { NextResponse } from 'next/server';
import { generateEstimatePdf } from '@/lib/tools/estimate-pdf';
import { calculateEstimateTotals, type EstimateData, type EstimateTotals } from '@/lib/tools/estimate-generator-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const estimate: EstimateData = body.estimate;

    if (!estimate || typeof estimate !== 'object') {
      return NextResponse.json({ error: 'Missing or invalid estimate payload' }, { status: 400 });
    }

    const totals: EstimateTotals =
      body.totals && typeof body.totals === 'object'
        ? body.totals
        : calculateEstimateTotals(
            estimate.items || [],
            estimate.taxRate || 0,
            estimate.depositPct || 0,
            estimate.discountAmount || 0,
            estimate.milestonesEnabled ? estimate.milestones : undefined
          );

    const pdfBuffer = await generateEstimatePdf(estimate, totals);

    const rawNum = estimate.estimateNumber?.trim() || 'estimate';
    const safeNum = rawNum.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Estimate-${safeNum}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error: any) {
    console.error('[API /api/tools/estimate-pdf] PDF generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}
