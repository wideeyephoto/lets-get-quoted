// Monthly financing payment calculation & quote badge generation.
//
// Pure, deterministic, and dependency-free.
// Helps contractors present high-ticket projects ($1,000+) with accessible
// monthly payment estimates (e.g. 12, 24, 36, or 60 months).

export const MIN_FINANCING_AMOUNT = 500;
export const DEFAULT_FINANCING_APR = 9.99;
export const DEFAULT_FINANCING_TERMS = [12, 24, 36, 60] as const;

export type FinancingTerm = (typeof DEFAULT_FINANCING_TERMS)[number];

export type FinancingOption = {
  months: number;
  monthlyPayment: number;
  totalRepayment: number;
  aprPercent: number;
  formattedMonthly: string;
};

/**
 * Calculates standard amortized monthly payment:
 * M = P * [r(1 + r)^n] / [(1 + r)^n - 1]
 * where r = monthly interest rate, n = number of months.
 */
export function calculateMonthlyPayment(principal: number, months: number, aprPercent = DEFAULT_FINANCING_APR): number {
  if (!principal || principal <= 0 || !months || months <= 0) return 0;

  if (aprPercent <= 0) {
    return Math.round((principal / months) * 100) / 100;
  }

  const monthlyRate = aprPercent / 100 / 12;
  const factor = Math.pow(1 + monthlyRate, months);
  const payment = (principal * (monthlyRate * factor)) / (factor - 1);

  return Math.round(payment * 100) / 100;
}

export function formatMonthlyEstimate(monthly: number): string {
  if (monthly == null || isNaN(monthly)) return '$0/mo';
  const rounded = Math.round(monthly);
  return `$${rounded.toLocaleString('en-US')}/mo`;
}

export function isFinancingEligible(totalAmount: number): boolean {
  return typeof totalAmount === 'number' && Number.isFinite(totalAmount) && totalAmount >= MIN_FINANCING_AMOUNT;
}

/**
 * Returns available financing breakdown terms for a given quote total.
 */
export function getFinancingOptions(totalAmount: number, aprPercent = DEFAULT_FINANCING_APR): FinancingOption[] {
  if (!isFinancingEligible(totalAmount)) return [];

  return DEFAULT_FINANCING_TERMS.map((months) => {
    const monthlyPayment = calculateMonthlyPayment(totalAmount, months, aprPercent);
    const totalRepayment = Math.round(monthlyPayment * months * 100) / 100;
    return {
      months,
      monthlyPayment,
      totalRepayment,
      aprPercent,
      formattedMonthly: formatMonthlyEstimate(monthlyPayment),
    };
  });
}

/**
 * Generates badge text for quote approval headers (e.g. "Or as low as $84/mo with financing").
 */
export function buildFinancingBadgeCopy(totalAmount: number, termMonths: FinancingTerm = 60, aprPercent = DEFAULT_FINANCING_APR): string | null {
  if (!isFinancingEligible(totalAmount)) return null;

  const monthly = calculateMonthlyPayment(totalAmount, termMonths, aprPercent);
  if (monthly <= 0) return null;

  return `Or as low as ${formatMonthlyEstimate(monthly)} with financing`;
}
