export type FinancingTermOption = {
  months: number;
  label: string;
  monthlyPayment: number;
  totalInterest: number;
  totalCost: number;
  apr: number;
};

/**
 * Standard fixed-rate loan amortization formula:
 * M = P * [r(1 + r)^n] / [(1 + r)^n - 1]
 */
export function calculateMonthlyPayment(principal: number, annualRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  if (annualRatePct <= 0) return principal / months;

  const monthlyRate = annualRatePct / 100 / 12;
  const factor = Math.pow(1 + monthlyRate, months);
  const monthlyPayment = (principal * (monthlyRate * factor)) / (factor - 1);
  return Math.round(monthlyPayment * 100) / 100;
}

export function calculateFinancingOptions(principal: number, customApr?: number): FinancingTermOption[] {
  const defaultApr = customApr ?? 8.99;
  const terms = [
    { months: 12, label: '12 Months (0% Promo)', apr: 0.0 }, // 0% promotional option
    { months: 24, label: '24 Months (2 Years)', apr: defaultApr },
    { months: 36, label: '36 Months (3 Years)', apr: defaultApr },
    { months: 60, label: '60 Months (5 Years)', apr: defaultApr },
    { months: 84, label: '84 Months (7 Years)', apr: defaultApr + 1.0 },
  ];

  return terms.map((t) => {
    const monthly = calculateMonthlyPayment(principal, t.apr, t.months);
    const totalCost = Math.round(monthly * t.months * 100) / 100;
    const totalInterest = Math.max(0, Math.round((totalCost - principal) * 100) / 100);
    return {
      months: t.months,
      label: t.label,
      monthlyPayment: monthly,
      totalInterest,
      totalCost,
      apr: t.apr,
    };
  });
}

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
