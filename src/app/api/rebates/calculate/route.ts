import { NextResponse } from 'next/server';
import { calculateCleanEnergyRebates, type CleanEnergyWorkCategory } from '@/lib/rebates/clean-energy-rebate-engine';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/rebates/calculate
 * Calculates Federal Inflation Reduction Act (IRA) tax credits and local utility rebates for quotes & estimates.
 */
export async function POST(request: Request) {
  const admin = createAdminClient();
  const ip = clientIpFrom(request.headers);
  if (!(await checkRateLimit(admin, `rebatecalc:ip:${ip}`, 30, 60))) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }
  let body: {
    category?: CleanEnergyWorkCategory;
    state?: string;
    projectCost?: number;
    utilityName?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body.category || body.projectCost == null) {
    return NextResponse.json({ error: 'category and projectCost are required.' }, { status: 400 });
  }

  const state = body.state || 'MI';

  try {
    const report = calculateCleanEnergyRebates({
      category: body.category,
      state,
      projectCost: Number(body.projectCost),
      utilityName: body.utilityName,
    });

    return NextResponse.json({
      success: true,
      rebateReport: report,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to calculate rebates.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
