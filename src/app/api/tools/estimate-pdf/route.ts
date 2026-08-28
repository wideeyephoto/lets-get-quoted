import { NextResponse } from 'next/server';
import { generateEstimatePdf } from '@/lib/tools/estimate-pdf';
import { calculateEstimateTotals, type EstimateData, type EstimateTotals } from '@/lib/tools/estimate-generator-utils';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ITEMS = 50;
const MAX_TIERS = 5;
const MAX_MILESTONES = 10;

export async function POST(request: Request) {
  const ip = clientIpFrom(request.headers);
  const admin = createAdminClient();
  const allowed = await checkRateLimit(admin, `tool-estimate-pdf:ip:${ip || 'anon'}`, 15, 60);

  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait a moment before generating another PDF.' },
      { status: 429 },
    );
  }

  try {
    const body = await request.json();
    const estimate: EstimateData = body.estimate;

    if (!estimate || typeof estimate !== 'object') {
      return NextResponse.json({ error: 'Missing or invalid estimate payload' }, { status: 400 });
    }

    // Defend against unbounded payload attacks causing PDFKit memory exhaustion
    if (Array.isArray(estimate.items) && estimate.items.length > MAX_ITEMS) {
      return NextResponse.json(
        { error: `Too many estimate line items (maximum allowed is ${MAX_ITEMS})` },
        { status: 400 },
      );
    }

    if (Array.isArray(estimate.tiers) && estimate.tiers.length > MAX_TIERS) {
      return NextResponse.json(
        { error: `Too many estimate tiers (maximum allowed is ${MAX_TIERS})` },
        { status: 400 },
      );
    }

    if (Array.isArray(estimate.milestones) && estimate.milestones.length > MAX_MILESTONES) {
      return NextResponse.json(
        { error: `Too many payment milestones (maximum allowed is ${MAX_MILESTONES})` },
        { status: 400 },
      );
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

    const rawNum = (estimate.estimateNumber || 'estimate').slice(0, 40).trim();
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API /api/tools/estimate-pdf] PDF generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: message },
      { status: 500 }
    );
  }
}
