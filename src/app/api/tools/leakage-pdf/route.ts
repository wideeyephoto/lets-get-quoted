import { NextResponse } from 'next/server';
import { generateLeakagePdf, type LeakageAuditData, type LeakageAuditCalculations } from '@/lib/tools/leakage-pdf';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ip = clientIpFrom(request.headers);
  const admin = createAdminClient();
  const allowed = await checkRateLimit(admin, `tool-leakage-pdf:ip:${ip || 'anon'}`, 15, 60);

  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait a moment before generating another PDF.' },
      { status: 429 },
    );
  }

  try {
    const body = await request.json();
    const data: LeakageAuditData = body.data || body;
    const calculations: LeakageAuditCalculations = body.calculations;

    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: 'Missing or invalid diagnostic payload' }, { status: 400 });
    }

    const revenue = Math.max(0, Number(data.revenue) || 0);
    const unbilledScopePct = Math.max(0, Math.min(100, Number(data.unbilledScopePct) || 0));
    const supplyHouseHours = Math.max(0, Math.min(168, Number(data.supplyHouseHours) || 0));
    const hourlyBillingRate = Math.max(0, Math.min(1000, Number(data.hourlyBillingRate) || 0));
    const checkTripsPerMonth = Math.max(0, Math.min(100, Number(data.checkTripsPerMonth) || 0));

    // Calculate fallback if not provided
    const annualScopeLoss = revenue * (unbilledScopePct / 100);
    const annualSupplyHouseLoss = supplyHouseHours * hourlyBillingRate * 50;
    const tripCost = 25 + 1.5 * hourlyBillingRate;
    const annualCheckChasingLoss = checkTripsPerMonth * 12 * tripCost;
    const annualCashFlowCost = revenue * 0.025;
    const totalAnnualLeakage =
      annualScopeLoss + annualSupplyHouseLoss + annualCheckChasingLoss + annualCashFlowCost;
    const recoverableWithLGQ = totalAnnualLeakage * 0.85;

    const finalCalculations: LeakageAuditCalculations = calculations && typeof calculations === 'object'
      ? {
          annualScopeLoss: Number(calculations.annualScopeLoss) || annualScopeLoss,
          annualSupplyHouseLoss: Number(calculations.annualSupplyHouseLoss) || annualSupplyHouseLoss,
          annualCheckChasingLoss: Number(calculations.annualCheckChasingLoss) || annualCheckChasingLoss,
          annualCashFlowCost: Number(calculations.annualCashFlowCost) || annualCashFlowCost,
          totalAnnualLeakage: Number(calculations.totalAnnualLeakage) || totalAnnualLeakage,
          recoverableWithLGQ: Number(calculations.recoverableWithLGQ) || recoverableWithLGQ,
        }
      : {
          annualScopeLoss,
          annualSupplyHouseLoss,
          annualCheckChasingLoss,
          annualCashFlowCost,
          totalAnnualLeakage,
          recoverableWithLGQ,
        };

    const pdfBuffer = await generateLeakagePdf(
      {
        revenue,
        unbilledScopePct,
        supplyHouseHours,
        hourlyBillingRate,
        checkTripsPerMonth,
        contractorName: typeof data.contractorName === 'string' ? data.contractorName.slice(0, 80) : undefined,
        referenceNumber: typeof data.referenceNumber === 'string' ? data.referenceNumber.slice(0, 30) : 'AUD-2026-LEAK',
        reportDate: typeof data.reportDate === 'string' ? data.reportDate.slice(0, 30) : undefined,
      },
      finalCalculations,
    );

    const filename = `Contractor-Profit-Leakage-Audit.pdf`;

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
    console.error('[API /api/tools/leakage-pdf] PDF generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: message },
      { status: 500 },
    );
  }
}
