/**
 * Merchandise Pricing & Revenue Take-Rate Engine
 *
 * Enforces:
 * - 10% Platform Take-Rate with a $5.00 minimum floor
 * - Free embroidery digitizing on 6+ items (absorbs the $6.50 fee)
 * - Transparent wholesale cost vs retail pricing
 * - Stripe credit card processing fee factoring
 */

export type PricingCalculationResult = {
  quantity: number;
  wholesaleUnitPrice: number;
  wholesaleTotal: number;
  retailUnitPrice: number;
  retailSubtotal: number;
  savingsPercent: number;
  digitizingFee: number;
  isFreeDigitizing: boolean;
  platformCutAmount: number;
  estimatedStripeFee: number;
  estimatedNetProfit: number;
  shippingCost: number;
  estimatedTax: number;
  grandTotal: number;
};

export const STATE_SALES_TAX_RATES: Record<string, number> = {
  AL: 0.04, AK: 0.00, AZ: 0.056, AR: 0.065, CA: 0.0725, CO: 0.029, CT: 0.0635,
  DE: 0.00, DC: 0.06, FL: 0.06, GA: 0.04, HI: 0.04, ID: 0.06, IL: 0.0625,
  IN: 0.07, IA: 0.06, KS: 0.065, KY: 0.06, LA: 0.0445, ME: 0.055, MD: 0.06,
  MA: 0.0625, MI: 0.06, MN: 0.06875, MS: 0.07, MO: 0.04225, MT: 0.00, NE: 0.055,
  NV: 0.0685, NH: 0.00, NJ: 0.06625, NM: 0.05, NY: 0.08, NC: 0.0475, ND: 0.05,
  OH: 0.0575, OK: 0.045, OR: 0.00, PA: 0.06, RI: 0.07, SC: 0.06, SD: 0.042,
  TN: 0.07, TX: 0.0625, UT: 0.061, VT: 0.06, VA: 0.053, WA: 0.065, WV: 0.06,
  WI: 0.05, WY: 0.04,
};

export function getSalesTaxRate(stateCode?: string | null): number {
  if (!stateCode) return 0.065;
  const cleanState = stateCode.trim().toUpperCase();
  if (cleanState in STATE_SALES_TAX_RATES) {
    return STATE_SALES_TAX_RATES[cleanState];
  }
  return 0.065;
}

export function calculateSalesTax(subtotal: number, stateCode?: string | null): number {
  const rate = getSalesTaxRate(stateCode);
  return Math.round(subtotal * rate * 100) / 100;
}

export type ServerItemPricing = {
  unitPrice: number;
  totalPrice: number;
  wholesaleUnitPrice: number;
  wholesaleTotal: number;
};

export function resolveServerItemPricing(
  product: { basePrice: number; pricingTiers: Array<{ quantity: number; unitPrice: number; totalPrice: number }> },
  quantity: number
): ServerItemPricing {
  const qty = Math.max(1, Math.floor(quantity));

  // 1. Check exact tier match
  const exactTier = product.pricingTiers.find((t) => t.quantity === qty);
  if (exactTier) {
    const wholesaleTotal = Math.round(product.basePrice * qty * 100) / 100;
    return {
      unitPrice: exactTier.unitPrice,
      totalPrice: exactTier.totalPrice,
      wholesaleUnitPrice: product.basePrice,
      wholesaleTotal,
    };
  }

  // 2. Custom or interpolated tier quantity
  const sortedTiers = [...product.pricingTiers].sort((a, b) => b.quantity - a.quantity);
  const matchedTier = sortedTiers.find((t) => qty >= t.quantity) || sortedTiers[sortedTiers.length - 1];

  const unitPrice = matchedTier ? matchedTier.unitPrice : Math.round(product.basePrice * 1.65 * 100) / 100;
  const totalPrice = Math.round(unitPrice * qty * 100) / 100;
  const wholesaleTotal = Math.round(product.basePrice * qty * 100) / 100;

  return {
    unitPrice,
    totalPrice,
    wholesaleUnitPrice: product.basePrice,
    wholesaleTotal,
  };
}

export function calculateMerchandisePricing(params: {
  wholesaleUnitCost: number;
  quantity: number;
  isEmbroidery?: boolean;
  shippingMethod?: 'standard' | 'rush';
  stateCode?: string;
}): PricingCalculationResult {
  const { wholesaleUnitCost, quantity, isEmbroidery = false, shippingMethod = 'standard', stateCode } = params;

  // Volume discount scale for wholesale markup
  let markupMultiplier = 1.65; // Base retail markup
  if (quantity >= 100) {
    markupMultiplier = 1.35;
  } else if (quantity >= 48) {
    markupMultiplier = 1.42;
  } else if (quantity >= 24) {
    markupMultiplier = 1.50;
  } else if (quantity >= 12) {
    markupMultiplier = 1.55;
  }

  const wholesaleTotal = Math.round(wholesaleUnitCost * quantity * 100) / 100;
  let retailUnitPrice = Math.round(wholesaleUnitCost * markupMultiplier * 100) / 100;

  // Ensure minimum retail unit price
  if (retailUnitPrice < 0.10) {
    retailUnitPrice = 0.10;
  }

  let retailSubtotal = Math.round(retailUnitPrice * quantity * 100) / 100;

  // Free digitizing for embroidery on 6+ units, otherwise standard $6.50 setup
  const isFreeDigitizing = !isEmbroidery || quantity >= 6;
  const digitizingFee = isEmbroidery && quantity < 6 ? 6.50 : 0;

  if (digitizingFee > 0) {
    retailSubtotal += digitizingFee;
  }

  // 10% Platform Take-Rate with $5.00 minimum floor
  const rawPlatformTenPercent = Math.round(retailSubtotal * 0.10 * 100) / 100;
  const platformCutAmount = Math.max(5.00, rawPlatformTenPercent);

  // Estimated Stripe Processing Fee (2.9% + $0.30)
  const estimatedStripeFee = Math.round((retailSubtotal * 0.029 + 0.30) * 100) / 100;

  // Shipping calculation (free over $150 standard)
  const shippingCost = shippingMethod === 'rush' ? 24.0 : retailSubtotal >= 150 ? 0.0 : 12.0;

  // Destination sales tax (state-specific lookup)
  const taxRate = getSalesTaxRate(stateCode);
  const estimatedTax = Math.round(retailSubtotal * taxRate * 100) / 100;

  // Grand total charged to contractor
  const grandTotal = Math.round((retailSubtotal + shippingCost + estimatedTax) * 100) / 100;

  // Net platform profit after wholesale manufacturing and Stripe fees
  const estimatedNetProfit = Math.round(
    (retailSubtotal - wholesaleTotal - estimatedStripeFee) * 100
  ) / 100;

  // Baseline savings percent comparison vs single-unit price
  const baseSingleUnitPrice = wholesaleUnitCost * 1.85;
  const savingsPercent = Math.max(
    0,
    Math.round(((baseSingleUnitPrice - retailUnitPrice) / baseSingleUnitPrice) * 100)
  );

  return {
    quantity,
    wholesaleUnitPrice: wholesaleUnitCost,
    wholesaleTotal,
    retailUnitPrice,
    retailSubtotal,
    savingsPercent,
    digitizingFee,
    isFreeDigitizing,
    platformCutAmount,
    estimatedStripeFee,
    estimatedNetProfit,
    shippingCost,
    estimatedTax,
    grandTotal,
  };
}
