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
import { resolveServerItemPricing, computePlatformCut } from '@/lib/merchandise/pricing';
import { calculatePrintfulShippingRates } from '@/lib/merchandise/printful-client';
import { getProductById } from '@/lib/merchandise/catalog';

/**
 * Server-side data loader for initial page render in page.tsx.
 * Called directly in SSR without uncacheable POST action overhead.
 */
export async function getMerchandiseStudioData(explicitAccountId?: string): Promise<MerchandiseStudioInitialData> {
  const accountId = explicitAccountId || (await requireOfficeContext('settings.read')).accountId;
  const admin = createAdminClient();

  // Fetch site record
  const { data: siteRow, error: siteError } = await admin
    .from('sites')
    .select('id, company_name, tagline, phone, license, accent_override, logo_url, content, subdomain, custom_domain')
    .eq('account_id', accountId)
    .limit(1)
    .maybeSingle();

  if (siteError) {
    console.error('Error fetching site data for merchandise studio:', siteError);
  }

  const content = (siteRow?.content && typeof siteRow.content === 'object' ? siteRow.content : {}) as Record<
    string,
    unknown
  >;

  const rawDomain = siteRow?.custom_domain?.trim();
  const rawSubdomain = siteRow?.subdomain?.trim();
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

  // Load past merchandise orders and sanitize private platform ledger fields
  const rawOrders = await listMerchandiseOrders(admin, accountId);
  const recentOrders = rawOrders.map((ord) => {
    const { revenueBreakdown: _omit, ...safe } = ord;
    return safe;
  });

  return {
    accountId,
    companyName: siteRow?.company_name || '',
    trade: (content.trade as string) || 'Contractor',
    tagline: siteRow?.tagline || '',
    phone: siteRow?.phone || '',
    website,
    license: siteRow?.license || '',
    accentColor: siteRow?.accent_override || '#2563eb',
    secondaryColor: (content.secondary_color as string) || '#f59e0b',
    currentLogoUrl: siteRow?.logo_url || null,
    aiLogos,
    recentOrders,
  };
}

/**
 * Loads initial data for the Merchandising Studio via server action.
 */
export async function getMerchandiseStudioDataAction(): Promise<{
  ok: boolean;
  data?: MerchandiseStudioInitialData;
  error?: string;
}> {
  try {
    const data = await getMerchandiseStudioData();
    return { ok: true, data };
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
 * Authenticated via settings.read.
 */
export async function validateMerchandiseAddressAction(params: {
  shippingAddress: ShippingAddress;
  items: MerchandiseOrderItem[];
}) {
  try {
    await requireOfficeContext('settings.read');
    const rateRes = await calculatePrintfulShippingRates(params);
    return rateRes;
  } catch (err) {
    return {
      ok: false,
      isValidAddress: true,
      error: err instanceof Error ? err.message : 'Address validation failed',
    };
  }
}

/**
 * Creates an instant purchasing checkout session via Stripe with Stripe Tax
 * and a 10% platform take-rate, then dispatches the order to fulfillment.
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
      return { ok: false, error: 'Select at least one merchandise item to order.' };
    }

    if (!params.proofApproved) {
      return {
        ok: false,
        error: 'Verify and sign off on your digital proof approval checkbox before ordering.',
      };
    }

    const addr = params.shippingAddress;
    if (!addr.fullName?.trim() || addr.fullName.trim().length < 2) {
      return { ok: false, error: 'Enter a valid recipient full name.' };
    }
    if (!addr.streetAddress?.trim() || addr.streetAddress.trim().length < 3) {
      return { ok: false, error: 'Enter a valid street address.' };
    }
    if (!addr.city?.trim() || addr.city.trim().length < 2) {
      return { ok: false, error: 'Enter a valid city.' };
    }
    if (!addr.state?.trim() || !/^[A-Za-z]{2}$/.test(addr.state.trim())) {
      return { ok: false, error: 'Enter a valid 2-letter US state code.' };
    }
    if (!addr.postalCode?.trim() || !/^\d{5}(-\d{4})?$/.test(addr.postalCode.trim())) {
      return { ok: false, error: 'Enter a valid 5-digit US ZIP code.' };
    }
    if (!addr.phone?.trim() || addr.phone.replace(/\D/g, '').length < 10) {
      return { ok: false, error: 'Please provide a valid 10-digit telephone number.' };
    }
    if (!addr.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr.email.trim())) {
      return { ok: false, error: 'Please provide a valid email address for delivery tracking.' };
    }

    // Authoritative Server-Side Pricing Calculation
    let totalWholesale = 0;
    let totalRetail = 0;
    const validatedItems: MerchandiseOrderItem[] = [];

    for (const it of params.items) {
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

    // Platform take-rate: 10% with $5.00 floor
    const platformCutAmount = computePlatformCut(subtotal);
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
          item.customizationDetails?.cardTemplateId ? `Template: ${item.customizationDetails.cardTemplateId}` : '',
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
            tax_behavior: 'exclusive' as const,
          },
          quantity: 1,
        };
      });

      // 1. Save initial order as pending_payment
      const initialTotal = Math.round((subtotal + shippingCost) * 100) / 100;
      const order = await saveMerchandiseOrder(admin, accountId, {
        items: validatedItems,
        subtotal,
        shippingCost,
        taxAmount: 0.0,
        totalAmount: initialTotal,
        shippingAddress: params.shippingAddress,
        status: 'pending_payment',
        proofApprovedAt: new Date().toISOString(),
        proofSnapshotUrl: params.proofSnapshotUrl,
        revenueBreakdown,
      });

      // 2. Create Stripe checkout session with Stripe Tax and proper shipping options
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: lineItems,
        customer_email: params.shippingAddress.email?.trim() || undefined,
        client_reference_id: order.orderNumber,
        automatic_tax: { enabled: true },
        shipping_address_collection: { allowed_countries: ['US'] },
        shipping_options: [
          {
            shipping_rate_data: {
              type: 'fixed_amount',
              fixed_amount: {
                amount: toCents(subtotal >= 150 ? 0.0 : 12.0),
                currency: 'usd',
              },
              display_name: 'Tracked Commercial Ground',
              delivery_estimate: {
                minimum: { unit: 'business_day', value: 3 },
                maximum: { unit: 'business_day', value: 5 },
              },
            },
          },
          {
            shipping_rate_data: {
              type: 'fixed_amount',
              fixed_amount: {
                amount: toCents(24.0),
                currency: 'usd',
              },
              display_name: 'Rush Priority Air Freight',
              delivery_estimate: {
                minimum: { unit: 'business_day', value: 2 },
                maximum: { unit: 'business_day', value: 2 },
              },
            },
          },
        ],
        expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour session expiration
        metadata: {
          account_id: accountId,
          merchandise_order: 'true',
          order_id: order.id,
          order_number: order.orderNumber,
          customer_name: params.shippingAddress.fullName,
          customer_phone: params.shippingAddress.phone,
          ship_city: params.shippingAddress.city,
          ship_state: params.shippingAddress.state,
          shipping_method: params.shippingMethod,
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

      // Sanitize: Strip revenueBreakdown from client-facing order payload
      const { revenueBreakdown: _omit, ...safeOrder } = order;

      return {
        ok: true,
        checkoutUrl: session.url || undefined,
        orderNumber: order.orderNumber,
        order: {
          ...safeOrder,
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
 * 1-Click Reorder: Re-prices items against the current catalog and routes
 * through checkout so payment is verified prior to fulfillment.
 */
export async function reorderMerchandiseAction(orderId: string): Promise<{
  ok: boolean;
  checkoutUrl?: string;
  order?: MerchandiseOrder;
  orderNumber?: string;
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

    // Authoritative re-pricing against current catalog to eliminate past loss-making pricing
    const reorderedItems: MerchandiseOrderItem[] = [];
    for (const it of pastOrder.items) {
      const prod = getProductById(it.productId, false);
      if (!prod) {
        return {
          ok: false,
          error: `Product "${it.productName}" is no longer available in the active storefront.`,
        };
      }
      const currentPricing = resolveServerItemPricing(prod, it.quantity);
      reorderedItems.push({
        ...it,
        productId: prod.id,
        productName: prod.name,
        unitPrice: currentPricing.unitPrice,
        totalPrice: currentPricing.totalPrice,
      });
    }

    // Route to checkout for payment verification
    return await createMerchandiseCheckoutAction({
      items: reorderedItems,
      shippingAddress: pastOrder.shippingAddress,
      shippingMethod: pastOrder.shippingCost >= 20 ? 'rush' : 'standard',
      proofApproved: true,
      proofSnapshotUrl: pastOrder.proofSnapshotUrl || undefined,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Reorder checkout initiation failed.' };
  }
}

/**
 * Fetches latest merchandise orders for the current account with private ledger fields stripped.
 */
export async function getMerchandiseOrdersAction(): Promise<{
  ok: boolean;
  orders: MerchandiseOrder[];
  error?: string;
}> {
  try {
    const { accountId } = await requireOfficeContext('settings.read');
    const admin = createAdminClient();
    const rawOrders = await listMerchandiseOrders(admin, accountId);
    const orders = rawOrders.map((ord) => {
      const { revenueBreakdown: _omit, ...safe } = ord;
      return safe;
    });
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
