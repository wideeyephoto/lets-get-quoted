import { NextResponse } from 'next/server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  listPurchaseOrders,
  createAndDispatchLivePO,
  WHOLESALE_MATERIAL_CATALOG,
  type SupplyDistributorKey,
  type SupportedTrade,
  type DeliveryMethod,
  type ContractorPricingTier,
} from '@/lib/supplies/distributor-pricing-engine';

export const dynamic = 'force-dynamic';

/**
 * GET /api/supplies/procurement
 * Query purchase orders or search the live material catalog.
 */
export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'orders';

  if (type === 'catalog') {
    const trade = searchParams.get('trade') as SupportedTrade | null;
    const distributor = searchParams.get('distributor') as SupplyDistributorKey | null;
    const q = (searchParams.get('q') || '').toLowerCase().trim();

    let catalog = WHOLESALE_MATERIAL_CATALOG;
    if (trade) catalog = catalog.filter((item) => item.trade === trade);
    if (distributor) catalog = catalog.filter((item) => item.distributorKey === distributor);
    if (q) {
      catalog = catalog.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q) ||
          item.manufacturer.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({
      success: true,
      itemsCount: catalog.length,
      catalog,
    });
  }

  const status = searchParams.get('status') as any;
  const distributorKey = searchParams.get('distributorKey') as any;

  const orders = await listPurchaseOrders(membership.accountId, {
    status: status || undefined,
    distributorKey: distributorKey || undefined,
  });

  return NextResponse.json({
    success: true,
    ordersCount: orders.length,
    orders,
  });
}

/**
 * POST /api/supplies/procurement
 * Creates and dispatches a live Purchase Order to wholesale distributor.
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

  if (membership.role === 'crew') {
    return NextResponse.json({ error: 'Forbidden for crew role.' }, { status: 403 });
  }

  const held = await loadHeldCapabilities(
    membership.role as 'owner' | 'crew' | 'office' | null,
    membership.accountId,
    user.id
  );

  if (membership.role !== 'owner' && !held.has('jobs.write')) {
    return NextResponse.json({ error: 'Permission jobs.write required.' }, { status: 403 });
  }

  let body: {
    jobRef: string;
    jobAddress: string;
    contractorName?: string;
    distributorKey: SupplyDistributorKey;
    trade: SupportedTrade;
    squaresOrUnits: number;
    deliveryMethod?: DeliveryMethod;
    deliveryDate?: string;
    distributorAccountRef?: string;
    deliveryNotes?: string;
    branchId?: string;
    contractorTier?: ContractorPricingTier;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  if (!body.jobRef || !body.jobAddress || !body.distributorKey || !body.trade || !body.squaresOrUnits) {
    return NextResponse.json(
      { error: 'Missing required fields: jobRef, jobAddress, distributorKey, trade, squaresOrUnits.' },
      { status: 400 }
    );
  }

  try {
    const result = await createAndDispatchLivePO({
      accountId: membership.accountId,
      jobRef: body.jobRef,
      jobAddress: body.jobAddress,
      contractorName: body.contractorName || 'Let\'s Get Quoted Partner Contractor',
      distributorKey: body.distributorKey,
      trade: body.trade,
      squaresOrUnits: body.squaresOrUnits,
      deliveryMethod: body.deliveryMethod,
      deliveryDate: body.deliveryDate,
      distributorAccountRef: body.distributorAccountRef,
      deliveryNotes: body.deliveryNotes,
      branchId: body.branchId,
      contractorTier: body.contractorTier,
    });

    return NextResponse.json({
      success: true,
      poNumber: result.poRecord.poNumber,
      order: result.poRecord,
      supplierResponse: result.supplierResponse,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to process supplier order.', details: err?.message },
      { status: 500 }
    );
  }
}
