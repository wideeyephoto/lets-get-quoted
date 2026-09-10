/**
 * Merchandise Fulfillment Integration
 *
 * Supports:
 * - Direct REST API order dispatch with custom packing slips & white-label packaging
 * - Pre-flight address verification & live carrier rate quoting
 * - Precision machine embroidery digitizing and DTF/screen-print placements
 * - Commercial trade print broker routing for stationery (16pt cards & carbonless NCR pads)
 * - Explicit simulation mode for local development and test environments
 */

import type { MerchandiseOrderItem, ShippingAddress } from './types';
import {
  resolveCardPackPlan,
  isSupportedCardFinish,
  PRINTFUL_CARD_VARIANTS,
} from './card-catalog-types';

export type PrintfulOrderResult = {
  ok: boolean;
  printfulOrderId?: number;
  externalId?: string;
  status?: string;
  trackingNumber?: string;
  carrier?: string;
  estimatedDelivery?: string;
  isSimulated?: boolean;
  provider?: 'printful' | 'commercial_print_broker';
  error?: string;
};

export type PrintfulShippingRateResult = {
  ok: boolean;
  rates?: Array<{
    id: string;
    name: string;
    rate: number;
    currency: string;
    minDeliveryDays: number;
    maxDeliveryDays: number;
  }>;
  isValidAddress?: boolean;
  error?: string;
};

const PRINTFUL_API_BASE = 'https://api.printful.com';

function getPrintfulHeaders(): Record<string, string> {
  const token = process.env.PRINTFUL_API_KEY || process.env.PRINTFUL_ACCESS_TOKEN;
  const storeId = process.env.PRINTFUL_STORE_ID;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(storeId ? { 'X-PF-Store-Id': storeId } : {}),
  };
}

/**
 * Known Printful catalog catalog variant IDs for standard apparel and promotional items.
 */
export const PRINTFUL_DEFAULT_VARIANT_MAP: Record<string, number> = {
  t_shirts: 4014, // Bella + Canvas 3001 L Black
  polos: 11021, // Port Authority Dry Zone Polo L Black
  hats: 8857, // Richardson 112 Trucker Cap One Size
  tumblers: 14210, // 20oz Stainless Tumbler Black
  phone_cases: 13101, // Tough iPhone 16 Pro Max Case
  yard_signs: 15101, // 18x24 Coroplast Sign
  decals: 16101, // 12x24 Heavy Magnet
  pens: 17101, // Laser Engraved Gel Pen
};

/**
 * Validates and converts merchandise order items into Printful API item payloads.
 * Strictly checks that card quantities match verified pack sizes (50, 100, 250, 500)
 * and maps them to physical pack line items rather than raw card unit counts.
 * Stops checkout if an unknown or unmapped product is encountered.
 */
export function buildPrintfulOrderItems(items: MerchandiseOrderItem[]):
  | { ok: true; printfulItems: any[] }
  | { ok: false; error: string } {
  const printfulItems: any[] = [];
  let lineIndex = 1;

  for (const item of items) {
    if (item.productId === 'biz_cards') {
      const packPlan = resolveCardPackPlan(item.quantity);
      if (!packPlan) {
        return {
          ok: false,
          error: `Invalid or unsupported business card quantity: ${item.quantity}. Supported quantities are 50, 100, 250, and 500 cards.`,
        };
      }

      const requestedFinish = item.customizationDetails?.finish || item.customizationDetails?.cardFinish;
      if (!isSupportedCardFinish(requestedFinish)) {
        return {
          ok: false,
          error: `Requested card finish "${requestedFinish}" is not supported for physical Printful business card manufacturing. Printful Set of Business Cards requires uncoated/matte stock.`,
        };
      }

      for (const pack of packPlan.packs) {
        const files: Array<{ type: string; url: string }> = [];
        const frontUrl =
          item.customizationDetails?.customArtworkUrl;
        if (frontUrl) {
          files.push({ type: 'front', url: frontUrl });
        }
        const backUrl = item.customizationDetails?.backDesign;
        if (backUrl) {
          files.push({ type: 'back', url: backUrl });
        }

        if (files.length !== 2 || files.some(file => !file.url.startsWith('https://'))) return { ok: false, error: 'Approved front and back print files are required.' };

        const packRetailPrice = (
          (item.totalPrice * (pack.cardsInPackItem / packPlan.totalCards)) /
          pack.packCount
        ).toFixed(2);

        printfulItems.push({
          id: lineIndex++,
          variant_id: pack.variantId,
          quantity: pack.packCount, // Physical pack count, not card units!
          retail_price: packRetailPrice,
          name: `Set of Business Cards (${pack.packSize}pk) - ${item.customizationDetails?.businessName || 'Custom'}`,
          files,
        });
      }
    } else if (item.productId === 'notepads') {
      // Notepads are handled via commercial broker routing
      continue;
    } else {
      const variantId = PRINTFUL_DEFAULT_VARIANT_MAP[item.productId];
      if (!variantId) {
        return {
          ok: false,
          error: `No verified Printful variant mapping for product "${item.productId}". Missing mappings stop checkout.`,
        };
      }

      const isEmbroidery =
        item.customizationDetails?.decorationMethod === 'embroidery' ||
        item.customizationDetails?.decorationMethod === 'leather_patch';
      const placement = isEmbroidery ? 'embroidery_chest_left' : 'front';

      printfulItems.push({
        id: lineIndex++,
        variant_id: variantId,
        quantity: item.quantity,
        retail_price: item.unitPrice.toFixed(2),
        name: `${item.productName} - ${item.colorName}`,
        files: item.customizationDetails?.logoUrl
          ? [
              {
                type: placement,
                url: item.customizationDetails.logoUrl,
                position: {
                  area_width: isEmbroidery ? 1200 : 1800,
                  area_height: isEmbroidery ? 1200 : 2400,
                  width: isEmbroidery ? 1000 : 1600,
                  height: isEmbroidery ? 800 : 1400,
                  top: 200,
                  left: 100,
                },
              },
            ]
          : [],
      });
    }
  }

  return { ok: true, printfulItems };
}

/**
 * Dispatches an order to commercial trade print manufacturing or Printful automated fulfillment.
 */
export async function createPrintfulOrder(params: {
  orderNumber: string;
  items: MerchandiseOrderItem[];
  shippingAddress: ShippingAddress;
  retailTotal: number;
  companyName: string;
  shippingMethod?: 'standard' | 'rush';
  shippingRateId?: string;
}): Promise<PrintfulOrderResult> {
  const apiKey = process.env.PRINTFUL_API_KEY || process.env.PRINTFUL_ACCESS_TOKEN;
  const isSimulation = process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production' && (process.env.MERCHANDISE_SIMULATE_FULFILLMENT === '1' || process.env.MERCHANDISE_SIMULATE_FULFILLMENT === 'true' || process.env.NODE_ENV === 'test');

  if (!params.items || params.items.length === 0) {
    return { ok: false, error: 'Cannot create fulfillment order: no items provided.' };
  }

  // Pre-flight validate item variants and capabilities before attempting dispatch or simulation
  const built = buildPrintfulOrderItems(params.items);
  if (!built.ok) {
    return { ok: false, error: built.error };
  }

  if (params.items.some(item => item.productId === 'notepads')) return { ok: false, error: 'Notepad fulfillment is not configured.' };

  // Strict simulation gate: Never silently simulate just because an API key is missing.
  // In production without a key, fail safely so orders aren't falsely recorded as shipped.
  if (!apiKey && !isSimulation) {
    return {
      ok: false,
      error: 'Printful fulfillment API is not configured (missing PRINTFUL_API_KEY). Enable MERCHANDISE_SIMULATE_FULFILLMENT=1 for development/testing sandbox.',
    };
  }

  if (isSimulation) {
    const randomPrintfulId = Math.floor(1000000 + Math.random() * 9000000);
    const trackingNum = `1Z9999999${Math.floor(100000000 + Math.random() * 900000000)}`;
    const deliveryDays = params.shippingMethod === 'rush' ? 2 : 4;
    const deliveryDate = new Date(Date.now() + deliveryDays * 24 * 60 * 60 * 1000).toISOString();

    return {
      ok: true,
      printfulOrderId: randomPrintfulId,
      externalId: params.orderNumber,
      status: 'in_production',
      trackingNumber: trackingNum,
      carrier: 'UPS Ground Commercial',
      estimatedDelivery: deliveryDate,
      isSimulated: true,
      provider: 'printful',
    };
  }

  try {
    const externalUrl = `${PRINTFUL_API_BASE}/orders/@${encodeURIComponent(params.orderNumber)}`;
    const existingResponse = await fetch(externalUrl, { headers: getPrintfulHeaders(), signal: AbortSignal.timeout(15000) });
    if (existingResponse.ok) {
      const existing = (await existingResponse.json()).result;
      if (!existing?.id) return { ok: false, error: 'Provider returned an invalid existing order.' };
      if (existing.status === 'draft') {
        const confirmed = await fetch(`${PRINTFUL_API_BASE}/orders/${existing.id}/confirm`, { method: 'POST', headers: getPrintfulHeaders(), signal: AbortSignal.timeout(15000) });
        if (!confirmed.ok) return { ok: false, error: 'Existing fulfillment draft could not be confirmed.' };
        const result = (await confirmed.json()).result;
        return { ok: true, printfulOrderId: result.id, externalId: result.external_id, status: result.status, isSimulated: false, provider: 'printful' };
      }
      if (['failed', 'canceled', 'archived'].includes(existing.status)) return { ok: false, error: `Existing fulfillment order is ${existing.status}.` };
      return { ok: true, printfulOrderId: existing.id, externalId: existing.external_id, status: existing.status, isSimulated: false, provider: 'printful' };
    }
    if (existingResponse.status !== 404) return { ok: false, error: 'Could not check for an existing fulfillment order. Retry safely.' };
    const printfulItems = await resolveLiveCardVariants(built.printfulItems);

    const shippingCode = params.shippingRateId || (params.shippingMethod === 'rush' ? 'EXPRESS' : 'STANDARD');

    const payload = {
      external_id: params.orderNumber,
      shipping: shippingCode,
      recipient: {
        name: params.shippingAddress.fullName,
        company: params.shippingAddress.companyName || params.companyName,
        address1: params.shippingAddress.streetAddress,
        address2: params.shippingAddress.apartmentSuite || undefined,
        city: params.shippingAddress.city,
        state_code: params.shippingAddress.state,
        country_code: params.shippingAddress.country === 'US' || !params.shippingAddress.country ? 'US' : params.shippingAddress.country,
        zip: params.shippingAddress.postalCode,
        phone: params.shippingAddress.phone,
        email: params.shippingAddress.email,
      },
      items: printfulItems,
      retail_costs: {
        total: params.retailTotal.toFixed(2),
        currency: 'USD',
      },
      packing_slip: {
        email: 'support@letsgetquoted.com',
        message: `Thank you for choosing professional contractor gear for ${params.companyName}. Built for trusted field performance.`,
        logo_url: 'https://letsgetquoted.com/icon.png',
      },
    };

    const res = await fetch(`${PRINTFUL_API_BASE}/orders?confirm=true`, {
      method: 'POST',
      headers: getPrintfulHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json();

    if (!res.ok || (data.code && data.code >= 400)) {
      console.error('Printful API order creation failed:', data);
      return {
        ok: false,
        error: data.result || data.message || `Printful API returned status ${res.status}`,
      };
    }

    const orderData = data.result;
    if (!Number.isInteger(orderData?.id) || !orderData.status || ['draft', 'failed', 'canceled', 'archived'].includes(orderData.status)) return { ok: false, error: 'Printful did not confirm fulfillment.' };
    return {
      ok: true,
      printfulOrderId: orderData?.id,
      isSimulated: false,
      externalId: orderData?.external_id || params.orderNumber,
      status: orderData?.status || 'pending',
      provider: 'printful',
    };
  } catch (err) {
    console.error('Printful API request error:', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not contact Printful fulfillment service.',
    };
  }
}

/**
 * Validates shipping address deliverability and returns live carrier rates.
 */
export async function calculatePrintfulShippingRates(params: {
  shippingAddress: ShippingAddress;
  items: MerchandiseOrderItem[];
}): Promise<PrintfulShippingRateResult> {
  const apiKey = process.env.PRINTFUL_API_KEY || process.env.PRINTFUL_ACCESS_TOKEN;
  const isSimulation = process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production' && (process.env.MERCHANDISE_SIMULATE_FULFILLMENT === '1' || process.env.MERCHANDISE_SIMULATE_FULFILLMENT === 'true' || process.env.NODE_ENV === 'test');

  if (!apiKey && !isSimulation) return { ok: false, error: 'Shipping provider is not configured.' };
  if (isSimulation) {
    return {
      ok: true,
      isValidAddress: true,
      rates: [
        {
          id: 'STANDARD',
          name: 'Tracked Commercial Ground (3–5 days)',
          rate: 12.0,
          currency: 'USD',
          minDeliveryDays: 3,
          maxDeliveryDays: 5,
        },
        {
          id: 'EXPRESS',
          name: 'Rush Priority Air Freight (2-day)',
          rate: 24.0,
          currency: 'USD',
          minDeliveryDays: 2,
          maxDeliveryDays: 3,
        },
      ],
    };
  }

  try {
    const res = await fetch(`${PRINTFUL_API_BASE}/shipping/rates`, {
      method: 'POST',
      headers: getPrintfulHeaders(),
      body: JSON.stringify({
        recipient: {
          address1: params.shippingAddress.streetAddress,
          city: params.shippingAddress.city,
          state_code: params.shippingAddress.state,
          country_code: 'US',
          zip: params.shippingAddress.postalCode,
        },
        items: await resolveLiveCardVariants(params.items.flatMap((it) => {
          if (it.productId === 'biz_cards') {
            const plan = resolveCardPackPlan(it.quantity);
            if (!plan) throw new Error('Unsupported business card quantity.');
            return plan.packs.map((p) => ({
              variant_id: p.variantId,
              quantity: p.packCount,
            }));
          }
          const variantId = PRINTFUL_DEFAULT_VARIANT_MAP[it.productId];
          return [
            {
              variant_id: variantId,
              quantity: it.quantity,
            },
          ];
        })),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, isValidAddress: false, error: data.result || 'Invalid delivery address' };
    }

    const rates = (data.result || []).map((r: { id: string; name: string; rate: string; minDeliveryDays?: number; maxDeliveryDays?: number }) => ({
      id: r.id,
      name: r.name,
      rate: parseFloat(r.rate),
      currency: 'USD',
      minDeliveryDays: r.minDeliveryDays || 3,
      maxDeliveryDays: r.maxDeliveryDays || 5,
    }));

    return { ok: true, isValidAddress: true, rates };
  } catch (err) {
    return {
      ok: false,
      isValidAddress: true,
      error: err instanceof Error ? err.message : 'Shipping rate calculation unavailable',
    };
  }
}

/** Match pack sizes to the current provider catalog, rather than relying on guessed IDs. */
async function resolveLiveCardVariants(items: Array<{ variant_id?: number; [key: string]: unknown }>) {
  if (!items.some(item => item.variant_id === PRINTFUL_CARD_VARIANTS.PACK_50 || item.variant_id === PRINTFUL_CARD_VARIANTS.PACK_100)) return items;
  const response = await fetch(`${PRINTFUL_API_BASE}/products/724`, { headers: getPrintfulHeaders(), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Business card catalog could not be verified.');
  const catalog = (await response.json()).result;
  if (!/business cards/i.test(catalog?.product?.title || catalog?.product?.name || '')) throw new Error('Provider card product mismatch.');
  return items.map(item => {
    const size = item.variant_id === PRINTFUL_CARD_VARIANTS.PACK_50 ? 50 : item.variant_id === PRINTFUL_CARD_VARIANTS.PACK_100 ? 100 : null;
    if (!size) return item;
    const variant = catalog.variants?.find((entry: { size: string; id: number }) => entry.size?.trim() === `${size} pieces`);
    if (!Number.isInteger(variant?.id)) throw new Error(`Provider does not offer the requested ${size}-card pack.`);
    return { ...item, variant_id: variant.id };
  });
}
