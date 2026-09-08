/**
 * Calculate 2/10 Net 30 Early Pay Discount
 */
export function calculateEarlyPayDiscount(amount: number, discountPct: number = 2): {
  discountAmount: number;
  discountedTotal: number;
  termsText: string;
} {
  const discountAmount = Math.round(amount * (discountPct / 100) * 100) / 100;
  const discountedTotal = Math.round((amount - discountAmount) * 100) / 100;
  return {
    discountAmount,
    discountedTotal,
    termsText: `Pay within 5 days to save $${discountAmount.toFixed(2)} (${discountPct}% early-pay discount). Total due: $${discountedTotal.toFixed(2)}.`,
  };
}
