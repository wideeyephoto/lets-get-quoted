import { NextResponse } from 'next/server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  getPurchaseOrderById,
  updatePurchaseOrderStatus,
  type PurchaseOrderStatus,
} from '@/lib/supplies/distributor-pricing-engine';

export const dynamic = 'force-dynamic';

/**
 * GET /api/supplies/procurement/[poId]
 * Retrieves full purchase order details, tracking information, and line items.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params;
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

  const po = await getPurchaseOrderById(poId);
  if (!po) {
    return NextResponse.json({ error: 'Purchase order not found.' }, { status: 404 });
  }

  if (po.accountId !== membership.accountId) {
    return NextResponse.json({ error: 'Unauthorized access to purchase order.' }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    order: po,
  });
}

/**
 * PATCH /api/supplies/procurement/[poId]
 * Updates status or tracking details for a purchase order.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params;
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

  const po = await getPurchaseOrderById(poId);
  if (!po) {
    return NextResponse.json({ error: 'Purchase order not found.' }, { status: 404 });
  }

  if (po.accountId !== membership.accountId) {
    return NextResponse.json({ error: 'Unauthorized access to purchase order.' }, { status: 403 });
  }

  let body: {
    status?: PurchaseOrderStatus;
    trackingNumber?: string;
    carrierName?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  if (!body.status) {
    return NextResponse.json({ error: 'Missing required field: status.' }, { status: 400 });
  }

  const updated = await updatePurchaseOrderStatus(poId, body.status, {
    trackingNumber: body.trackingNumber,
    carrierName: body.carrierName,
  });

  return NextResponse.json({
    success: true,
    order: updated,
  });
}
