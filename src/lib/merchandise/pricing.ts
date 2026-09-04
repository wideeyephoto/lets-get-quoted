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

export function calculateMerchandisePricing(params: {
  wholesaleUnitCost: number;
  quantity: number;
  isEmbroidery?: boolean;
  shippingMethod?: 'standard' | 'rush';
}): PricingCalculationResult {
  const { wholesaleUnitCost, quantity, isEmbroidery = false, shippingMethod = 'standard' } = params;

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

  // Estimated destination sales tax (6.5%)
  const estimatedTax = Math.round(retailSubtotal * 0.065 * 100) / 100;

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
