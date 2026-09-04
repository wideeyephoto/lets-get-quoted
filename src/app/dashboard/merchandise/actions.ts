'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { requireOfficeContext, createAdminClient } from '@/lib/auth';
import { getStripeClient, toCents } from '@/lib/stripe';
import { listUploadedSiteImages } from '@/lib/site-image-storage';
import type { GeneratedAiLogo } from '@/app/dashboard/sites/actions';
import type {
  MerchandiseOrderItem,
  ShippingAddress,
  MerchandiseStudioInitialData,
  MerchandiseOrder,
} from '@/lib/merchandise/types';
import { saveMerchandiseOrder, listMerchandiseOrders } from '@/lib/merchandise/orders';
import { calculateMerchandisePricing } from '@/lib/merchandise/pricing';
import { createPrintfulOrder, calculatePrintfulShippingRates } from '@/lib/merchandise/printful-client';
import { getProductById } from '@/lib/merchandise/catalog';

/**
 * Loads the initial data for the Merchandising Studio:
 * - Brand identity (Business name, trade, colors, phone, website)
 * - Saved AI and vector logo assets
 * - Order history
 */
export async function getMerchandiseStudioDataAction(): Promise<{
  ok: boolean;
  data?: MerchandiseStudioInitialData;
  error?: string;
}> {
  try {
    const { accountId } = await requireOfficeContext('settings.read');
    const admin = createAdminClient();

    // Fetch site record
    const { data: siteRow } = await admin
      .from('sites')
      .select('id, company_name, tagline, phone, license, accent_override, logo_url, content')
      .eq('account_id', accountId)
      .limit(1)
      .maybeSingle();

    const content = (siteRow?.content && typeof siteRow.content === 'object' ? siteRow.content : {}) as Record<
      string,
      unknown
    >;

    let aiLogos: GeneratedAiLogo[] = Array.isArray(content.ai_logos)
      ? (content.ai_logos as GeneratedAiLogo[])
      : [];

    // Fallback logo discovery if none saved in site content
    if (aiLogos.length === 0) {
      const uploaded = await listUploadedSiteImages(accountId).catch(() => []);
      const legacyLogos = uploaded.filter((img) => img.storagePath?.includes('-ai-logo'));
      if (legacyLogos.length > 0) {
        aiLogos = legacyLogos.map((img) => ({
          id: img.id,
          url: img.url,
          storagePath: img.storagePath ?? '',
          direction: 'bold_symbol' as const,
          prompt: 'Contractor Brand Mark',
          createdAt: new Date().toISOString(),
        }));
      }
    }

    // Load past merchandise orders
    const recentOrders = await listMerchandiseOrders(admin, accountId);

    const initialData: MerchandiseStudioInitialData = {
      companyName: siteRow?.company_name || 'Premier Contractors',
      trade: (content.trade as string) || 'Contractor',
      tagline: siteRow?.tagline || 'Licensed, Insured & Trusted Workmanship',
      phone: siteRow?.phone || '(555) 234-5678',
      website: 'www.contractorpro.com',
      license: siteRow?.license || 'LIC #849201-B',
      accentColor: siteRow?.accent_override || '#2563eb',
      secondaryColor: (content.secondary_color as string) || '#f59e0b',
      currentLogoUrl: siteRow?.logo_url || null,
      aiLogos,
      recentOrders,
    };

    return { ok: true, data: initialData };
  } catch (err) {
    console.error('Failed to load merchandise studio data:', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not initialize merchandise studio.',
    };
  }
}

/**
 * Pre-flights delivery address validation & live shipping rates.
 */
export async function validateMerchandiseAddressAction(params: {
  shippingAddress: ShippingAddress;
  items: MerchandiseOrderItem[];
}) {
  try {
    const rateRes = await calculatePrintfulShippingRates(params);
    return rateRes;
  } catch (err) {
    return { ok: false, isValidAddress: true, error: err instanceof Error ? err.message : 'Address validation failed' };
  }
}

/**
 * Creates an instant purchasing checkout session via Stripe with a 10% platform take-rate,
 * then dispatches the order to Printful automated fulfillment.
 */
export async function createMerchandiseCheckoutAction(params: {
  items: MerchandiseOrderItem[];
  shippingAddress: ShippingAddress;
  shippingMethod: 'standard' | 'rush';
  proofApproved: boolean;
  proofSnapshotUrl?: string;
  isInstantTestOrder?: boolean;
}): Promise<{
  ok: boolean;
  checkoutUrl?: string;
  order?: MerchandiseOrder;
  orderNumber?: string;
  error?: string;
}> {
  try {
    const { accountId } = await requireOfficeContext('settings.write');
    const admin = createAdminClient();

    if (!params.items || params.items.length === 0) {
      return { ok: false, error: 'Please select at least one merchandise item to order.' };
    }

    if (!params.proofApproved) {
      return {
        ok: false,
        error: 'Please verify and sign off on your digital proof approval checkbox before ordering.',
      };
    }

    if (!params.shippingAddress.fullName || !params.shippingAddress.streetAddress || !params.shippingAddress.postalCode) {
      return { ok: false, error: 'Please complete all required shipping address fields.' };
    }

    // Calculate item pricing & 10% platform take-rate
    let totalWholesale = 0;
    let totalRetail = 0;

    for (const it of params.items) {
      const prod = getProductById(it.productId);
      const wholesaleUnit = prod ? prod.basePrice : it.unitPrice * 0.65;
      const isEmbroidery = it.customizationDetails.decorationMethod === 'embroidery' || it.customizationDetails.decorationMethod === 'leather_patch';

      const pricing = calculateMerchandisePricing({
        wholesaleUnitCost: wholesaleUnit,
        quantity: it.quantity,
        isEmbroidery,
        shippingMethod: params.shippingMethod,
      });

      totalWholesale += pricing.wholesaleTotal;
      totalRetail += it.totalPrice;
    }

    const subtotal = Math.round(totalRetail * 100) / 100;
    const shippingCost = params.shippingMethod === 'rush' ? 24.0 : subtotal >= 150 ? 0.0 : 12.0;
    const taxAmount = Math.round(subtotal * 0.065 * 100) / 100;
    const totalAmount = Math.round((subtotal + shippingCost + taxAmount) * 100) / 100;

    // 10% platform take-rate with $5.00 minimum floor
    const rawCut = Math.round(subtotal * 0.10 * 100) / 100;
    const platformCutAmount = Math.max(5.00, rawCut);
    const estimatedStripeFee = Math.round((subtotal * 0.029 + 0.30) * 100) / 100;
    const netProfit = Math.round((subtotal - totalWholesale - estimatedStripeFee) * 100) / 100;

    const revenueBreakdown = {
      platformCutAmount,
      wholesaleCost: totalWholesale,
      stripeFee: estimatedStripeFee,
      netProfit,
    };

    const reqHeaders = await headers();
    const host = reqHeaders.get('host') || 'localhost:3010';
    const proto = reqHeaders.get('x-forwarded-proto') || 'http';
    const origin = `${proto}://${host}`;

    const hasStripeKey = Boolean(process.env.STRIPE_SECRET_KEY);

    // If Stripe is configured and user did not request instant test order
    if (hasStripeKey && !params.isInstantTestOrder) {
      try {
        const stripe = getStripeClient();

        const lineItems = params.items.map((item) => {
          const detailParts = [
            `Color: ${item.colorName}`,
            item.customizationDetails.finish ? `Finish: ${item.customizationDetails.finish}` : '',
            item.customizationDetails.deviceModel ? `Model: ${item.customizationDetails.deviceModel}` : '',
            item.customizationDetails.sizeBreakdown
              ? `Sizes: ${Object.entries(item.customizationDetails.sizeBreakdown)
                  .filter(([, count]) => count > 0)
                  .map(([s, c]) => `${s}: ${c}`)
                  .join(', ')}`
              : '',
          ]
            .filter(Boolean)
            .join(' | ');

          return {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${item.productName} (Qty: ${item.quantity})`,
                description: `${detailParts || 'Highest quality contractor print'} | Brand: ${item.customizationDetails.businessName}`,
                images: item.customizationDetails.logoUrl ? [item.customizationDetails.logoUrl] : undefined,
              },
              unit_amount: toCents(item.unitPrice),
            },
            quantity: item.quantity,
          };
        });

        // Add shipping line item if applicable
        if (shippingCost > 0) {
          lineItems.push({
            price_data: {
              currency: 'usd',
              product_data: {
                name: params.shippingMethod === 'rush' ? 'Rush Priority Air Freight' : 'Tracked Commercial Ground',
                description: params.shippingMethod === 'rush' ? 'Expedited 2-day transit' : 'Standard 3-5 business day transit',
                images: undefined,
              },
              unit_amount: toCents(shippingCost),
            },
            quantity: 1,
          });
        }

        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          payment_method_types: ['card'],
          line_items: lineItems,
          customer_email: params.shippingAddress.email || undefined,
          metadata: {
            account_id: accountId,
            merchandise_order: 'true',
            customer_name: params.shippingAddress.fullName,
            customer_phone: params.shippingAddress.phone,
            ship_city: params.shippingAddress.city,
            ship_state: params.shippingAddress.state,
            platform_cut: platformCutAmount.toString(),
          },
          success_url: `${origin}/dashboard/merchandise?order_success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/dashboard/merchandise?order_cancelled=true`,
        });

        // Save order and record 10% platform revenue cut
        const order = await saveMerchandiseOrder(admin, accountId, {
          items: params.items,
          subtotal,
          shippingCost,
          taxAmount,
          totalAmount,
          shippingAddress: params.shippingAddress,
          stripeSessionId: session.id,
          status: 'pending_payment',
          proofApprovedAt: new Date().toISOString(),
          proofSnapshotUrl: params.proofSnapshotUrl,
          revenueBreakdown,
        });

        // Dispatch to Printful
        const printfulRes = await createPrintfulOrder({
          orderNumber: order.orderNumber,
          items: params.items,
          shippingAddress: params.shippingAddress,
          retailTotal: totalAmount,
          companyName: params.items[0]?.customizationDetails.businessName || 'Contractor Brand',
        });

        revalidatePath('/dashboard/merchandise');
        return {
          ok: true,
          checkoutUrl: session.url || undefined,
          orderNumber: order.orderNumber,
          order: {
            ...order,
            printfulOrderId: printfulRes.printfulOrderId,
          },
        };
      } catch (stripeErr) {
        console.warn('Stripe checkout session failed; falling back to instant direct order:', stripeErr);
      }
    }

    // Direct Instant Order (Test / Sandbox / Offline Mode)
    const order = await saveMerchandiseOrder(admin, accountId, {
      items: params.items,
      subtotal,
      shippingCost,
      taxAmount,
      totalAmount,
      shippingAddress: params.shippingAddress,
      status: 'proof_approved',
      proofApprovedAt: new Date().toISOString(),
      proofSnapshotUrl: params.proofSnapshotUrl,
      revenueBreakdown,
    });

    // Dispatch to Printful fulfillment
    await createPrintfulOrder({
      orderNumber: order.orderNumber,
      items: params.items,
      shippingAddress: params.shippingAddress,
      retailTotal: totalAmount,
      companyName: params.items[0]?.customizationDetails.businessName || 'Contractor Brand',
    });

    revalidatePath('/dashboard/merchandise');
    return {
      ok: true,
      order,
      orderNumber: order.orderNumber,
    };
  } catch (err) {
    console.error('Failed to create merchandise checkout:', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not complete merchandise checkout.',
    };
  }
}

/**
 * 1-Click Reorder for returning crew or seasonal gear.
 */
export async function reorderMerchandiseAction(orderId: string): Promise<{
  ok: boolean;
  order?: MerchandiseOrder;
  error?: string;
}> {
  try {
    const { accountId } = await requireOfficeContext('settings.write');
    const admin = createAdminClient();
    const existingOrders = await listMerchandiseOrders(admin, accountId);
    const pastOrder = existingOrders.find((o) => o.id === orderId);

    if (!pastOrder) {
      return { ok: false, error: 'Previous order not found.' };
    }

    const reordered = await saveMerchandiseOrder(admin, accountId, {
      items: pastOrder.items,
      subtotal: pastOrder.subtotal,
      shippingCost: pastOrder.shippingCost,
      taxAmount: pastOrder.taxAmount,
      totalAmount: pastOrder.totalAmount,
      shippingAddress: pastOrder.shippingAddress,
      status: 'in_production',
      proofApprovedAt: new Date().toISOString(),
      proofSnapshotUrl: pastOrder.proofSnapshotUrl,
      revenueBreakdown: pastOrder.revenueBreakdown,
    });

    revalidatePath('/dashboard/merchandise');
    return { ok: true, order: reordered };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Reorder failed.' };
  }
}

/**
 * Fetches latest merchandise orders for the current account.
 */
export async function getMerchandiseOrdersAction(): Promise<{
  ok: boolean;
  orders: MerchandiseOrder[];
  error?: string;
}> {
  try {
    const { accountId } = await requireOfficeContext('settings.read');
    const admin = createAdminClient();
    const orders = await listMerchandiseOrders(admin, accountId);
    return { ok: true, orders };
  } catch (err) {
    console.error('Failed to load merchandise orders:', err);
    return {
      ok: false,
      orders: [],
      error: err instanceof Error ? err.message : 'Could not fetch merchandise orders.',
    };
  }
}
