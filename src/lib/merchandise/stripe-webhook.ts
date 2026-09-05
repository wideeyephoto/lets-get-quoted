import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  updateMerchandiseOrder,
  recordMerchandiseRevenueLedger,
  recordMerchandiseFulfillmentAttempt,
} from './orders';
import { createPrintfulOrder } from './printful-client';
import { getProductById } from './catalog';
import { computePlatformCut } from './pricing';
import { getStripeClient } from '@/lib/stripe';
import { sendCustomerMerchandiseReceipt, sendStaffMerchandiseAlert } from './merchandise-emails';
import type { MerchandiseOrder, MerchandiseOrderItem, ShippingAddress } from './types';

/**
 * Stripe Webhook Handler for Merchandise Studio Orders
 *
 * Handles:
 * - checkout.session.completed (verified payment, captured tax/shipping, dispatch, revenue ledger)
 * - checkout.session.expired (cancelled order)
 * - charge.refunded (order status update and ledger reversal)
 * - charge.dispute.created (order status update and alert)
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
      let shippingAddress = order.shipping_address as ShippingAddress;
      const subtotal = Number(order.subtotal);

      // Captured exact tax, shipping, and total amounts from Stripe
      const capturedTax = session.total_details?.amount_tax != null
        ? session.total_details.amount_tax / 100
        : Number(order.tax_amount);
      const capturedShipping = session.total_details?.amount_shipping != null
        ? session.total_details.amount_shipping / 100
        : Number(order.shipping_cost);
      const capturedTotal = session.amount_total != null
        ? session.amount_total / 100
        : Number(order.total_amount);

      // If customer confirmed or updated shipping address on Stripe checkout, capture it
      const shippingDetails = session.collected_information?.shipping_details || (session as unknown as { shipping_details?: { address?: { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; country?: string | null }; name?: string | null } }).shipping_details;
      if (shippingDetails?.address) {
        const addr = shippingDetails.address;
        shippingAddress = {
          fullName: shippingDetails.name || shippingAddress.fullName,
          companyName: shippingAddress.companyName,
          streetAddress: addr.line1 || shippingAddress.streetAddress,
          apartmentSuite: addr.line2 || shippingAddress.apartmentSuite,
          city: addr.city || shippingAddress.city,
          state: addr.state || shippingAddress.state,
          postalCode: addr.postal_code || shippingAddress.postalCode,
          country: addr.country || shippingAddress.country || 'US',
          phone: session.customer_details?.phone || shippingAddress.phone,
          email: session.customer_details?.email || shippingAddress.email,
          deliveryNotes: shippingAddress.deliveryNotes,
        };
      }

      // Derive wholesale manufacturing cost
      let wholesaleCost = parseFloat(session.metadata.wholesale_cost || '0');
      if (wholesaleCost <= 0) {
        for (const it of items) {
          const prod = getProductById(it.productId, true);
          const unitWholesale = prod ? prod.basePrice : it.unitPrice * 0.65;
          wholesaleCost += Math.round(unitWholesale * it.quantity * 100) / 100;
        }
      }

      // Unified platform take-rate with $5.00 floor
      const platformCutAmount = computePlatformCut(subtotal);

      // Read real fee from the Stripe balance transaction instead of estimating
      let stripeFee = Math.round((capturedTotal * 0.029 + 0.30) * 100) / 100;
      if (paymentIntentId) {
        try {
          const stripe = getStripeClient();
          if (stripe?.paymentIntents?.retrieve) {
            const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
              expand: ['latest_charge.balance_transaction'],
            });
            const charge = pi.latest_charge as Stripe.Charge | undefined;
            const balanceTx = charge?.balance_transaction as Stripe.BalanceTransaction | undefined;
            if (balanceTx && typeof balanceTx.fee === 'number') {
              stripeFee = Math.round(balanceTx.fee) / 100;
            }
          }
        } catch (feeErr) {
          console.warn('Could not read Stripe balance transaction fee, using calculated fallback:', feeErr);
        }
      }

      // Net platform profit: gross subtotal minus wholesale cost and Stripe fee
      const netProfit = Math.round((subtotal - wholesaleCost - stripeFee) * 100) / 100;

      // Dispatch order to fulfillment provider
      const printfulRes = await createPrintfulOrder({
        orderNumber: order.order_number,
        items,
        shippingAddress,
        retailTotal: capturedTotal,
        companyName: items[0]?.customizationDetails?.businessName || 'Contractor Brand',
        shippingMethod: session.metadata?.shipping_method === 'rush' ? 'rush' : 'standard',
      });

      // Record fulfillment attempt in dead-letter / audit table
      await recordMerchandiseFulfillmentAttempt(admin, {
        orderId: order.id,
        provider: printfulRes.provider || 'printful',
        status: printfulRes.ok ? 'succeeded' : 'failed',
        responsePayload: printfulRes,
        errorMessage: printfulRes.ok ? null : printfulRes.error,
      });

      // Update order status with captured Stripe numbers and fulfillment result
      const newStatus = printfulRes.ok ? 'in_production' : 'proof_approved';
      await updateMerchandiseOrder(admin, order.id, {
        status: newStatus,
        stripePaymentIntentId: paymentIntentId,
        printfulOrderId: printfulRes.printfulOrderId || null,
        trackingNumber: printfulRes.trackingNumber || null,
        trackingCarrier: printfulRes.carrier || null,
        estimatedDeliveryDate: printfulRes.estimatedDelivery || null,
        taxAmount: capturedTax,
        shippingCost: capturedShipping,
        totalAmount: capturedTotal,
        shippingAddress,
      });

      // Record platform revenue in merchandise_revenue_ledger (service-role only)
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

      const updatedOrderRecord: MerchandiseOrder = {
        ...order,
        status: newStatus,
        subtotal,
        shippingCost: capturedShipping,
        taxAmount: capturedTax,
        totalAmount: capturedTotal,
        shippingAddress,
        stripePaymentIntentId: paymentIntentId,
        trackingNumber: printfulRes.trackingNumber || null,
        trackingCarrier: printfulRes.carrier || null,
      };

      // Send customer confirmation email & digital proof receipt
      const customerEmail = shippingAddress.email || session.customer_details?.email;
      if (customerEmail) {
        await sendCustomerMerchandiseReceipt({
          order: updatedOrderRecord,
          customerEmail,
          customerName: shippingAddress.fullName,
          shippingAddress,
        });
      }

      // Send staff alert
      await sendStaffMerchandiseAlert({
        order: updatedOrderRecord,
        provider: printfulRes.provider,
        isSimulated: printfulRes.isSimulated,
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

  // Handle refunds: mark merchandise order as refunded and record reversal
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;

    if (piId) {
      const { data: order } = await admin
        .from('merchandise_orders')
        .select('id, order_number, account_id, subtotal')
        .eq('stripe_payment_intent_id', piId)
        .maybeSingle();

      if (order) {
        await updateMerchandiseOrder(admin, order.id, {
          status: 'refunded',
        });

        const refundAmount = charge.amount_refunded ? charge.amount_refunded / 100 : Number(order.subtotal);
        await recordMerchandiseRevenueLedger(admin, {
          accountId: order.account_id,
          orderId: order.id,
          orderNumber: `${order.order_number}-REFUND`,
          grossRetailAmount: -refundAmount,
          wholesaleCost: 0,
          platformCutAmount: 0,
          stripeFee: 0,
          netProfit: -refundAmount,
        });

        return true;
      }
    }
  }

  // Handle dispute created
  if (event.type === 'charge.dispute.created') {
    const dispute = event.data.object as Stripe.Dispute;
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;

    if (chargeId) {
      const { data: order } = await admin
        .from('merchandise_orders')
        .select('id')
        .eq('stripe_payment_intent_id', dispute.payment_intent)
        .maybeSingle();

      if (order) {
        await updateMerchandiseOrder(admin, order.id, {
          status: 'disputed',
        });
        return true;
      }
    }
  }

  return false;
}
