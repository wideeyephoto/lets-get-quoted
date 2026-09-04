import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { updateMerchandiseOrder, recordMerchandiseRevenueLedger } from './orders';
import { createPrintfulOrder } from './printful-client';
import { getProductById } from './catalog';
import type { MerchandiseOrderItem, ShippingAddress } from './types';

/**
 * Stripe Webhook Handler for Merchandise Studio Orders
 *
 * Listens for checkout.session.completed with merchandise_order: 'true'.
 * Dispatches to Printful and logs the 10% platform fee only AFTER payment is verified.
 */
export async function handleMerchandiseWebhookEvent(
  event: Stripe.Event,
  admin: SupabaseClient
): Promise<boolean> {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.metadata?.merchandise_order !== 'true') {
      return false;
    }

    const accountId = session.metadata.account_id;
    const orderId = session.metadata.order_id;
    const orderNumber = session.metadata.order_number;

    // Look up the merchandise order
    let query = admin.from('merchandise_orders').select('*');
    if (orderId) {
      query = query.eq('id', orderId);
    } else if (orderNumber) {
      query = query.eq('order_number', orderNumber);
    } else {
      query = query.eq('stripe_session_id', session.id);
    }

    const { data: order, error } = await query.maybeSingle();

    if (error || !order) {
      console.warn('Merchandise webhook received but order not found:', {
        sessionId: session.id,
        orderId,
        orderNumber,
        error,
      });
      return true; // Mark handled so event doesn't retry endlessly
    }

    // Idempotency guard: If order is not pending_payment, it has already been processed
    if (order.status !== 'pending_payment') {
      return true;
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null;

    if (session.payment_status === 'paid') {
      const items = (order.items || []) as MerchandiseOrderItem[];
      const shippingAddress = order.shipping_address as ShippingAddress;
      const subtotal = Number(order.subtotal);
      const totalAmount = Number(order.total_amount);

      // Derive wholesale manufacturing cost and platform cut
      let wholesaleCost = parseFloat(session.metadata.wholesale_cost || '0');
      if (wholesaleCost <= 0) {
        for (const it of items) {
          const prod = getProductById(it.productId, true);
          const unitWholesale = prod ? prod.basePrice : it.unitPrice * 0.65;
          wholesaleCost += Math.round(unitWholesale * it.quantity * 100) / 100;
        }
      }

      const rawCut = Math.round(subtotal * 0.10 * 100) / 100;
      const platformCutAmount = parseFloat(session.metadata.platform_cut || '0') || Math.max(5.0, rawCut);
      const stripeFee = Math.round((subtotal * 0.029 + 0.30) * 100) / 100;
      const netProfit = Math.round((subtotal - wholesaleCost - stripeFee) * 100) / 100;

      // Dispatch order to Printful fulfillment
      const printfulRes = await createPrintfulOrder({
        orderNumber: order.order_number,
        items,
        shippingAddress,
        retailTotal: totalAmount,
        companyName: items[0]?.customizationDetails?.businessName || 'Contractor Brand',
      });

      // Update order with payment and fulfillment status
      await updateMerchandiseOrder(admin, order.id, {
        status: printfulRes.ok ? 'in_production' : 'proof_approved',
        stripePaymentIntentId: paymentIntentId,
        printfulOrderId: printfulRes.printfulOrderId || null,
        trackingNumber: printfulRes.trackingNumber || null,
        trackingCarrier: printfulRes.carrier || null,
        estimatedDeliveryDate: printfulRes.estimatedDelivery || null,
      });

      // Record platform revenue in merchandise_revenue_ledger
      await recordMerchandiseRevenueLedger(admin, {
        accountId: order.account_id || accountId,
        orderId: order.id,
        orderNumber: order.order_number,
        grossRetailAmount: subtotal,
        wholesaleCost,
        platformCutAmount,
        stripeFee,
        netProfit,
      });

      return true;
    } else if (session.payment_status === 'unpaid' && paymentIntentId) {
      // Asynchronous/delayed payment method (e.g. ACH)
      await updateMerchandiseOrder(admin, order.id, {
        stripePaymentIntentId: paymentIntentId,
      });
      return true;
    }

    return true;
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.merchandise_order !== 'true') {
      return false;
    }

    const { data: order } = await admin
      .from('merchandise_orders')
      .select('id, status')
      .eq('stripe_session_id', session.id)
      .maybeSingle();

    if (order && order.status === 'pending_payment') {
      await updateMerchandiseOrder(admin, order.id, {
        status: 'cancelled',
      });
    }

    return true;
  }

  return false;
}
