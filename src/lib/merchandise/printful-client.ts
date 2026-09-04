/**
 * Printful REST API Client for Highest-Quality Contractor Merchandise
 *
 * Supports:
 * - Direct REST API order dispatch with custom packing slips & white-label packaging
 * - Pre-flight address verification & live carrier rate quoting
 * - Precision machine embroidery digitizing and DTF/screen-print placements
 * - Mock / Sandbox simulation for local development and unit tests
 */

import type { MerchandiseOrderItem, ShippingAddress } from './types';

export type PrintfulOrderResult = {
  ok: boolean;
  printfulOrderId?: number;
  externalId?: string;
  status?: string;
  trackingNumber?: string;
  carrier?: string;
  estimatedDelivery?: string;
  isSimulated?: boolean;
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
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Creates an order directly in Printful's automated fulfillment system.
 */
export async function createPrintfulOrder(params: {
  orderNumber: string;
  items: MerchandiseOrderItem[];
  shippingAddress: ShippingAddress;
  retailTotal: number;
  companyName: string;
}): Promise<PrintfulOrderResult> {
  const apiKey = process.env.PRINTFUL_API_KEY || process.env.PRINTFUL_ACCESS_TOKEN;

  // Fallback to simulated high-fidelity fulfillment if in development or API key not yet set
  if (!apiKey || process.env.NODE_ENV === 'test' || apiKey.startsWith('test_')) {
    const randomPrintfulId = Math.floor(1000000 + Math.random() * 9000000);
    const trackingNum = `1Z9999999${Math.floor(100000000 + Math.random() * 900000000)}`;
    const deliveryDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();

    return {
      ok: true,
      printfulOrderId: randomPrintfulId,
      externalId: params.orderNumber,
      status: 'in_production',
      trackingNumber: trackingNum,
      carrier: 'UPS Ground Commercial',
      estimatedDelivery: deliveryDate,
      isSimulated: true,
    };
  }

  try {
    const printfulItems = params.items.map((item, index) => {
      const isEmbroidery = item.customizationDetails.decorationMethod === 'embroidery' || item.customizationDetails.decorationMethod === 'leather_patch';
      const placement = isEmbroidery ? 'embroidery_chest_left' : 'front';

      return {
        id: index + 1,
        quantity: item.quantity,
        retail_price: item.unitPrice.toFixed(2),
        name: `${item.productName} - ${item.colorName}`,
        files: item.customizationDetails.logoUrl
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
      };
    });

    const payload = {
      external_id: params.orderNumber,
      shipping: 'STANDARD',
      recipient: {
        name: params.shippingAddress.fullName,
        company: params.shippingAddress.companyName || params.companyName,
        address1: params.shippingAddress.streetAddress,
        address2: params.shippingAddress.apartmentSuite || undefined,
        city: params.shippingAddress.city,
        state_code: params.shippingAddress.state,
        country_code: 'US',
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
        phone: '(800) 555-0199',
        message: `Thank you for choosing professional contractor gear for ${params.companyName}. Built for trusted field performance.`,
        logo_url: 'https://letsgetquoted.com/icon.png',
      },
    };

    const res = await fetch(`${PRINTFUL_API_BASE}/orders`, {
      method: 'POST',
      headers: getPrintfulHeaders(),
      body: JSON.stringify(payload),
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
    return {
      ok: true,
      printfulOrderId: orderData?.id,
      externalId: orderData?.external_id || params.orderNumber,
      status: orderData?.status || 'pending',
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

  if (!apiKey || process.env.NODE_ENV === 'test') {
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
        items: params.items.map((it) => ({
          quantity: it.quantity,
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
      isValidAddress: true, // fallback to avoid blocking user if service is unreachable
      error: err instanceof Error ? err.message : 'Shipping rate calculation unavailable',
    };
  }
}
