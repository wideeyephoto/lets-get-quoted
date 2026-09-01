export interface FinancingPlanOption {
  provider: 'affirm' | 'klarna' | 'afterpay_clearpay';
  monthlyEstimateDollars: number;
  termMonths: number;
  aprPercent: number;
  eligible: boolean;
  minAmountDollars: number;
  maxAmountDollars: number;
}

export interface QuoteFinancingEligibility {
  totalQuoteDollars: number;
  isFinancingEligible: boolean;
  options: FinancingPlanOption[];
  headlineMessage: string;
}

/**
 * Evaluates Buy Now Pay Later (BNPL) financing eligibility for homeowner quotes between $500 and $30,000.
 */
export function evaluateQuoteFinancingEligibility(totalQuoteDollars: number): QuoteFinancingEligibility {
  const isEligible = totalQuoteDollars >= 500 && totalQuoteDollars <= 30000;

  if (!isEligible) {
    return {
      totalQuoteDollars,
      isFinancingEligible: false,
      options: [],
      headlineMessage: totalQuoteDollars < 500
        ? 'Standard single payment for projects under $500.'
        : 'Commercial project financing available upon custom lender review.',
    };
  }

  // Affirm 12-month standard option (e.g. 0%-15% APR depending on credit, estimated at standard 7.99%)
  const affirm12 = Math.round((totalQuoteDollars * 1.08) / 12);
  const klarna4 = Math.round(totalQuoteDollars / 4);

  const options: FinancingPlanOption[] = [
    {
      provider: 'affirm',
      monthlyEstimateDollars: affirm12,
      termMonths: 12,
      aprPercent: 7.99,
      eligible: true,
      minAmountDollars: 500,
      maxAmountDollars: 30000,
    },
    {
      provider: 'klarna',
      monthlyEstimateDollars: klarna4,
      termMonths: 2, // 4 bi-weekly payments
      aprPercent: 0.0,
      eligible: totalQuoteDollars <= 4000,
      minAmountDollars: 100,
      maxAmountDollars: 4000,
    },
  ];

  return {
    totalQuoteDollars,
    isFinancingEligible: true,
    options,
    headlineMessage: `Pay as low as $${affirm12}/mo with 0% down homeowner financing via Stripe.`,
  };
}
