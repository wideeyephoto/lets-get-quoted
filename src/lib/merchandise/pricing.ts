/**
 * Merchandise Pricing & Revenue Take-Rate Engine
 *
 * Enforces:
 * - 10% Platform Take-Rate with a $5.00 minimum floor
 *   (Effectively a 14.3% take-rate on the minimum $35 order size to cover fixed processing and order overhead)
 * - Authoritative server-side tier resolution
 * - Real Stripe credit card balance transaction fee recording
 *
 * Sales tax is handled by Stripe Tax (automatic_tax: { enabled: true }) at checkout.
 * The legacy STATE_SALES_TAX_RATES lookup table has been retired because the business
 * is not registered in 45 states and hardcoded tables cannot accurately represent
 * local county/city jurisdictions or shipping taxability.
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
  grandTotal: number;
};

/**
 * Computes the platform take-rate with a $5.00 minimum floor.
 * Unified function called by checkout actions, revenue ledger recording, and webhooks.
 */
export function computePlatformCut(subtotal: number): number {
  const rawCut = Math.round(subtotal * 0.10 * 100) / 100;
  return Math.max(5.00, rawCut);
}

export type ServerItemPricing = {
  unitPrice: number;
  totalPrice: number;
  wholesaleUnitPrice: number;
  wholesaleTotal: number;
};

/**
 * Resolves authoritative server-side item pricing from the catalog.
 * Immune to client-side price tampering.
 */
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

  // 2. Custom or interpolated tier quantity: find closest tier whose min quantity <= requested quantity
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

/**
 * Calculates estimated line-item pricing and platform take-rate for custom product configurations.
 */
export function calculateMerchandisePricing(params: {
  wholesaleUnitCost: number;
  quantity: number;
  isEmbroidery?: boolean;
  shippingMethod?: 'standard' | 'rush';
}): PricingCalculationResult {
  const { wholesaleUnitCost, quantity, isEmbroidery = false, shippingMethod = 'standard' } = params;

  // Volume discount scale for wholesale markup
  let markupMultiplier = 1.65;
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
  const platformCutAmount = computePlatformCut(retailSubtotal);

  // Estimated Stripe Processing Fee on subtotal (for pre-checkout margin estimation)
  const estimatedStripeFee = Math.round((retailSubtotal * 0.029 + 0.30) * 100) / 100;

  // Shipping calculation (free over $150 standard)
  const shippingCost = shippingMethod === 'rush' ? 24.0 : retailSubtotal >= 150 ? 0.0 : 12.0;

  // Grand total before automatic taxes
  const grandTotal = Math.round((retailSubtotal + shippingCost) * 100) / 100;

  // Net platform profit: gross subtotal minus wholesale cost and Stripe fee
  const estimatedNetProfit = Math.round(
    (retailSubtotal - wholesaleTotal - estimatedStripeFee) * 100
  ) / 100;

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
    grandTotal,
  };
}
