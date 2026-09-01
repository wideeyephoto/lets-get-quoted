import { NextResponse } from 'next/server';
import { getCurrentMembership } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  calculateBillOfMaterials,
  compareSupplierQuotes,
  DISTRIBUTORS,
  type SupportedTrade,
  type SupplyDistributorKey,
  type ContractorPricingTier,
  type DeliveryMethod,
} from '@/lib/supplies/distributor-pricing-engine';

export const dynamic = 'force-dynamic';

/**
 * POST /api/supplies/pricing
 * Calculates BOM quotes or performs cross-distributor pricing comparisons.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const membership = await getCurrentMembership(user.id);
  if (!membership.accountId) {
    return NextResponse.json({ error: 'No active workspace.' }, { status: 403 });
  }

  let body: {
    trade: SupportedTrade;
    squaresOrUnits: number;
    distributorKey?: SupplyDistributorKey;
    contractorTier?: ContractorPricingTier;
    deliveryMethod?: DeliveryMethod;
    wasteFactorPercent?: number;
    compareAll?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  if (!body.trade || !body.squaresOrUnits) {
    return NextResponse.json(
      { error: 'Missing required fields: trade, squaresOrUnits.' },
      { status: 400 }
    );
  }

  if (body.compareAll) {
    const comparison = compareSupplierQuotes(body.trade, body.squaresOrUnits, {
      contractorTier: body.contractorTier,
      deliveryMethod: body.deliveryMethod,
    });

    return NextResponse.json({
      success: true,
      comparison,
    });
  }

  const distributorKey = body.distributorKey || 'abc_supply';
  const bom = calculateBillOfMaterials(body.trade, body.squaresOrUnits, distributorKey, {
    contractorTier: body.contractorTier,
    wasteFactorPercent: body.wasteFactorPercent,
  });

  return NextResponse.json({
    success: true,
    bom,
  });
}
