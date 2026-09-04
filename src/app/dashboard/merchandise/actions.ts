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
import { saveMerchandiseOrder, listMerchandiseOrders, updateMerchandiseOrder } from '@/lib/merchandise/orders';
import { calculateMerchandisePricing, resolveServerItemPricing, calculateSalesTax } from '@/lib/merchandise/pricing';
import { calculatePrintfulShippingRates } from '@/lib/merchandise/printful-client';
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
      .select('id, company_name, tagline, phone, license, accent_override, logo_url, content, subdomain, custom_domain')
      .eq('account_id', accountId)
      .limit(1)
      .maybeSingle();

    const content = (siteRow?.content && typeof siteRow.content === 'object' ? siteRow.content : {}) as Record<
      string,
      unknown
    >;

    // Real web address resolution (custom domain > subdomain.letsgetquoted.com > content.website > fallback)
    const siteWithDomains = siteRow as {
      company_name?: string | null;
      tagline?: string | null;
      phone?: string | null;
      license?: string | null;
      accent_override?: string | null;
      logo_url?: string | null;
      content?: unknown;
      subdomain?: string | null;
      custom_domain?: string | null;
    } | null;

    const rawDomain = siteWithDomains?.custom_domain?.trim();
    const rawSubdomain = siteWithDomains?.subdomain?.trim();
    const contentWebsite = typeof content.website === 'string' ? content.website.trim() : '';

    let website = '';
    if (rawDomain) {
      website = rawDomain.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    } else if (rawSubdomain) {
      website = `${rawSubdomain}.letsgetquoted.com`;
    } else if (contentWebsite) {
      website = contentWebsite.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    } else if (siteRow?.company_name) {
      const slug = siteRow.company_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      website = slug ? `www.${slug}.com` : 'www.contractorpro.com';
    } else {
      website = 'www.contractorpro.com';
    }

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
      accountId,
      companyName: siteRow?.company_name || 'Premier Contractors',
      trade: (content.trade as string) || 'Contractor',
      tagline: siteRow?.tagline || 'Licensed, Insured & Trusted Workmanship',
      phone: siteRow?.phone || '(555) 234-5678',
      website,
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

    // Authoritative Server-Side Pricing Calculation
    let totalWholesale = 0;
    let totalRetail = 0;
    const validatedItems: MerchandiseOrderItem[] = [];

    for (const it of params.items) {
      // Must be an active storefront product
      const prod = getProductById(it.productId, false);
      if (!prod) {
        return {
          ok: false,
          error: `Product "${it.productName || it.productId}" is no longer available in the active storefront.`,
        };
      }

      const serverPricing = resolveServerItemPricing(prod, it.quantity);
      totalWholesale += serverPricing.wholesaleTotal;
      totalRetail += serverPricing.totalPrice;

      validatedItems.push({
        ...it,
        productId: prod.id,
        productName: prod.name,
        quantity: it.quantity,
        unitPrice: serverPricing.unitPrice,
        totalPrice: serverPricing.totalPrice,
      });
    }

    const subtotal = Math.round(totalRetail * 100) / 100;
    const shippingCost = params.shippingMethod === 'rush' ? 24.0 : subtotal >= 150 ? 0.0 : 12.0;
    const taxAmount = calculateSalesTax(subtotal, params.shippingAddress.state);
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

    const hasStripeKey = Boolean(process.env.STRIPE_SECRET_KEY);
    if (!hasStripeKey) {
      return {
        ok: false,
        error: 'Stripe payment gateway is not configured for merchandise checkout.',
      };
    }

    const reqHeaders = await headers();
    const host = reqHeaders.get('host') || 'localhost:3010';
    const proto = reqHeaders.get('x-forwarded-proto') || 'http';
    const origin = `${proto}://${host}`;

    try {
      const stripe = getStripeClient();
      if (!stripe) {
        return { ok: false, error: 'Stripe is not configured. Payment processing is currently unavailable.' };
      }

      const lineItems = validatedItems.map((item) => {
        const bizName = item.customizationDetails?.businessName || '';
        const logoUrl = item.customizationDetails?.logoUrl;
        const detailParts = [
          `Color: ${item.colorName}`,
          item.customizationDetails?.finish ? `Finish: ${item.customizationDetails.finish}` : '',
          item.customizationDetails?.deviceModel ? `Model: ${item.customizationDetails.deviceModel}` : '',
          item.customizationDetails?.sizeBreakdown
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
              description: detailParts
                ? `${detailParts}${bizName ? ` | Brand: ${bizName}` : ''}`
                : (bizName ? `Brand: ${bizName}` : 'Commercial contractor print'),
              images: logoUrl ? [logoUrl] : undefined,
            },
            unit_amount: toCents(item.totalPrice),
          },
          quantity: 1,
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

      // 1. Save initial order as pending_payment (without dispatching to Printful)
      const order = await saveMerchandiseOrder(admin, accountId, {
        items: validatedItems,
        subtotal,
        shippingCost,
        taxAmount,
        totalAmount,
        shippingAddress: params.shippingAddress,
        status: 'pending_payment',
        proofApprovedAt: new Date().toISOString(),
        proofSnapshotUrl: params.proofSnapshotUrl,
        revenueBreakdown,
      });

      // 2. Create Stripe checkout session with order linkage
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: lineItems,
        customer_email: params.shippingAddress.email || undefined,
        client_reference_id: order.orderNumber,
        metadata: {
          account_id: accountId,
          merchandise_order: 'true',
          order_id: order.id,
          order_number: order.orderNumber,
          customer_name: params.shippingAddress.fullName,
          customer_phone: params.shippingAddress.phone,
          ship_city: params.shippingAddress.city,
          ship_state: params.shippingAddress.state,
          platform_cut: platformCutAmount.toString(),
          wholesale_cost: totalWholesale.toString(),
        },
        success_url: `${origin}/dashboard/merchandise?order_success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/dashboard/merchandise?order_cancelled=true`,
      });

      // 3. Link stripe session to order
      await updateMerchandiseOrder(admin, order.id, {
        stripeSessionId: session.id,
      });

      revalidatePath('/dashboard/merchandise');
      return {
        ok: true,
        checkoutUrl: session.url || undefined,
        orderNumber: order.orderNumber,
        order: {
          ...order,
          stripeSessionId: session.id,
        },
      };
    } catch (stripeErr) {
      console.error('Stripe merchandise checkout failed:', stripeErr);
      return {
        ok: false,
        error: stripeErr instanceof Error ? stripeErr.message : 'Payment gateway checkout failed.',
      };
    }
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
