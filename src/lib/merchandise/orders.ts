/**
 * Merchandise Order Persistence & Revenue Ledger
 *
 * Handles order creation, status transitions, and tracking.
 * Records the 10% platform fee in merchandise_revenue_ledger.
 * Includes graceful fallback to site JSON metadata when dedicated
 * migration has not yet been executed in a local or preview sandbox.
 */

import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MerchandiseOrder, MerchandiseOrderItem, ShippingAddress } from './types';

export function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  const timeSuffix = Date.now().toString(36).toUpperCase().slice(-4);
  const entropy = randomBytes(3).toString('hex').toUpperCase();
  return `LGQ-MRCH-${year}-${timeSuffix}-${entropy}`;
}

export async function saveMerchandiseOrder(
  supabase: SupabaseClient,
  accountId: string,
  params: {
    items: MerchandiseOrderItem[];
    subtotal: number;
    shippingCost: number;
    taxAmount: number;
    totalAmount: number;
    shippingAddress: ShippingAddress;
    stripeSessionId?: string | null;
    stripePaymentIntentId?: string | null;
    printfulOrderId?: number | null;
    trackingNumber?: string | null;
    trackingCarrier?: string | null;
    estimatedDeliveryDate?: string | null;
    status?: MerchandiseOrder['status'];
    proofApprovedAt?: string | null;
    proofSnapshotUrl?: string | null;
    revenueBreakdown?: {
      platformCutAmount: number;
      wholesaleCost: number;
      stripeFee: number;
      netProfit: number;
    };
  }
): Promise<MerchandiseOrder> {
  const orderNumber = generateOrderNumber();
  const now = new Date().toISOString();

  const newOrder: MerchandiseOrder = {
    id: `ord_${Date.now()}_${randomBytes(4).toString('hex')}`,
    accountId,
    orderNumber,
    status: params.status || (params.stripeSessionId ? 'pending_payment' : 'proof_approved'),
    items: params.items,
    subtotal: params.subtotal,
    shippingCost: params.shippingCost,
    taxAmount: params.taxAmount,
    totalAmount: params.totalAmount,
    shippingAddress: params.shippingAddress,
    stripeSessionId: params.stripeSessionId || null,
    stripePaymentIntentId: params.stripePaymentIntentId || null,
    printfulOrderId: params.printfulOrderId || null,
    trackingNumber: params.trackingNumber || null,
    trackingCarrier: params.trackingCarrier || null,
    estimatedDeliveryDate: params.estimatedDeliveryDate || null,
    proofApprovedAt: params.proofApprovedAt || now,
    proofSnapshotUrl: params.proofSnapshotUrl || null,
    revenueBreakdown: params.revenueBreakdown,
    createdAt: now,
    updatedAt: now,
  };

  // Attempt to write to dedicated merchandise_orders table
  try {
    const { data, error } = await supabase
      .from('merchandise_orders')
      .insert({
        account_id: accountId,
        order_number: newOrder.orderNumber,
        status: newOrder.status,
        items: newOrder.items,
        subtotal: newOrder.subtotal,
        shipping_cost: newOrder.shippingCost,
        tax_amount: newOrder.taxAmount,
        total_amount: newOrder.totalAmount,
        shipping_address: newOrder.shippingAddress,
        stripe_session_id: newOrder.stripeSessionId,
        stripe_payment_intent_id: newOrder.stripePaymentIntentId,
        printful_order_id: newOrder.printfulOrderId,
        tracking_number: newOrder.trackingNumber,
        tracking_carrier: newOrder.trackingCarrier,
        estimated_delivery_date: newOrder.estimatedDeliveryDate,
        proof_approved_at: newOrder.proofApprovedAt,
        proof_snapshot_url: newOrder.proofSnapshotUrl,
      })
      .select('id, order_number, status, items, subtotal, shipping_cost, tax_amount, total_amount, shipping_address, stripe_session_id, stripe_payment_intent_id, printful_order_id, tracking_number, tracking_carrier, estimated_delivery_date, proof_approved_at, proof_snapshot_url, created_at, updated_at')
      .single();

    if (!error && data) {
      return {
        id: data.id,
        accountId,
        orderNumber: data.order_number,
        status: data.status as MerchandiseOrder['status'],
        items: data.items as MerchandiseOrderItem[],
        subtotal: Number(data.subtotal),
        shippingCost: Number(data.shipping_cost),
        taxAmount: Number(data.tax_amount),
        totalAmount: Number(data.total_amount),
        shippingAddress: data.shipping_address as ShippingAddress,
        stripeSessionId: data.stripe_session_id,
        stripePaymentIntentId: data.stripe_payment_intent_id,
        printfulOrderId: data.printful_order_id,
        trackingNumber: data.tracking_number,
        trackingCarrier: data.tracking_carrier,
        estimatedDeliveryDate: data.estimated_delivery_date,
        proofApprovedAt: data.proof_approved_at,
        proofSnapshotUrl: data.proof_snapshot_url,
        revenueBreakdown: params.revenueBreakdown,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }

    if (error && error.code !== '42P01') {
      console.error('Database error inserting merchandise order:', error);
      throw new Error(`Could not insert merchandise order: ${error.message}`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Could not insert merchandise order:')) {
      throw err;
    }
    // Fall back to site content metadata if table does not exist
  }

  // Graceful fallback: Store in sites.content.merchandise_orders
  try {
    const { data: siteRow } = await supabase
      .from('sites')
      .select('id, content')
      .eq('account_id', accountId)
      .limit(1)
      .maybeSingle();

    if (siteRow) {
      const content = (siteRow.content && typeof siteRow.content === 'object' ? siteRow.content : {}) as Record<string, unknown>;
      const existing = Array.isArray(content.merchandise_orders) ? (content.merchandise_orders as MerchandiseOrder[]) : [];
      const updated = [newOrder, ...existing];

      await supabase
        .from('sites')
        .update({
          content: {
            ...content,
            merchandise_orders: updated,
          },
        })
        .eq('id', siteRow.id);
    }
  } catch (err) {
    console.warn('Could not persist merchandise order to fallback site metadata:', err);
  }

  return newOrder;
}

export async function listMerchandiseOrders(
  supabase: SupabaseClient,
  accountId: string
): Promise<MerchandiseOrder[]> {
  // First attempt table read
  try {
    const { data, error } = await supabase
      .from('merchandise_orders')
      .select('id, order_number, status, items, subtotal, shipping_cost, tax_amount, total_amount, shipping_address, stripe_session_id, stripe_payment_intent_id, printful_order_id, tracking_number, tracking_carrier, estimated_delivery_date, proof_approved_at, proof_snapshot_url, created_at, updated_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      return data.map((d) => ({
        id: d.id,
        accountId,
        orderNumber: d.order_number,
        status: d.status as MerchandiseOrder['status'],
        items: d.items as MerchandiseOrderItem[],
        subtotal: Number(d.subtotal),
        shippingCost: Number(d.shipping_cost),
        taxAmount: Number(d.tax_amount),
        totalAmount: Number(d.total_amount),
        shippingAddress: d.shipping_address as ShippingAddress,
        stripeSessionId: d.stripe_session_id,
        stripePaymentIntentId: d.stripe_payment_intent_id,
        printfulOrderId: d.printful_order_id,
        trackingNumber: d.tracking_number,
        trackingCarrier: d.tracking_carrier,
        estimatedDeliveryDate: d.estimated_delivery_date,
        proofApprovedAt: d.proof_approved_at,
        proofSnapshotUrl: d.proof_snapshot_url,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      }));
    }
  } catch {
    // Fall back to JSON content
  }

  // Fallback: Read from sites.content.merchandise_orders
  try {
    const { data: siteRow } = await supabase
      .from('sites')
      .select('content')
      .eq('account_id', accountId)
      .limit(1)
      .maybeSingle();

    if (siteRow?.content && typeof siteRow.content === 'object') {
      const content = siteRow.content as Record<string, unknown>;
      if (Array.isArray(content.merchandise_orders)) {
        return content.merchandise_orders as MerchandiseOrder[];
      }
    }
  } catch (err) {
    console.warn('Could not load merchandise orders fallback:', err);
  }

  return [];
}

/**
 * Records platform take-rate fee into merchandise_revenue_ledger upon confirmed payment.
 */
export async function recordMerchandiseRevenueLedger(
  supabase: SupabaseClient,
  params: {
    accountId: string;
    orderId: string;
    orderNumber: string;
    grossRetailAmount: number;
    wholesaleCost: number;
    platformCutAmount: number;
    stripeFee: number;
    netProfit: number;
  }
): Promise<boolean> {
  try {
    const { error } = await supabase.from('merchandise_revenue_ledger').insert({
      account_id: params.accountId,
      order_id: params.orderId,
      order_number: params.orderNumber,
      gross_retail_amount: params.grossRetailAmount,
      wholesale_manufacturing_cost: params.wholesaleCost,
      platform_cut_amount: params.platformCutAmount,
      stripe_processing_fee: params.stripeFee,
      net_platform_profit: params.netProfit,
    });

    if (error) {
      console.warn('Could not record merchandise revenue ledger entry:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Failed to insert merchandise revenue ledger entry:', err);
    return false;
  }
}

/**
 * Updates status, fulfillment, and payment IDs on an existing merchandise order.
 */
export async function updateMerchandiseOrder(
  supabase: SupabaseClient,
  orderIdOrNumber: string,
  updates: Partial<{
    status: MerchandiseOrder['status'];
    stripeSessionId: string | null;
    stripePaymentIntentId: string | null;
    printfulOrderId: number | null;
    trackingNumber: string | null;
    trackingCarrier: string | null;
    estimatedDeliveryDate: string | null;
  }>
): Promise<boolean> {
  try {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.stripeSessionId !== undefined) payload.stripe_session_id = updates.stripeSessionId;
    if (updates.stripePaymentIntentId !== undefined) payload.stripe_payment_intent_id = updates.stripePaymentIntentId;
    if (updates.printfulOrderId !== undefined) payload.printful_order_id = updates.printfulOrderId;
    if (updates.trackingNumber !== undefined) payload.tracking_number = updates.trackingNumber;
    if (updates.trackingCarrier !== undefined) payload.tracking_carrier = updates.trackingCarrier;
    if (updates.estimatedDeliveryDate !== undefined) payload.estimated_delivery_date = updates.estimatedDeliveryDate;

    let query = supabase.from('merchandise_orders').update(payload);
    if (orderIdOrNumber.startsWith('LGQ-MRCH-')) {
      query = query.eq('order_number', orderIdOrNumber);
    } else {
      query = query.eq('id', orderIdOrNumber);
    }

    const { error } = await query;
    if (error) {
      console.warn('Could not update merchandise order:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Failed to update merchandise order:', err);
    return false;
  }
}
