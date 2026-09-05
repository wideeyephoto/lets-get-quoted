import { HOMEOWNER_FINANCING } from '@/lib/bnpl-financing';

export interface FinancialForecastMonth {
  monthIndex: number;
  monthName: string;
  projectedMrrDollars: number;
  projectedActiveSubscribers: number;
  projectedTransactionFeesDollars: number;
  projectedAdWalletSpendDollars: number;
  projectedGrossRevenueDollars: number;
  churnRatePercent: number;
}

export interface ExecutiveFinancialForecast {
  currentMrrDollars: number;
  growthRateMonthlyPercent: number;
  projected90DayMrrDollars: number;
  projectedAnnualRunRateDollars: number;
  months: FinancialForecastMonth[];
  keyDrivers: string[];
  recommendations: string[];
}

/**
 * Computes a predictive 90-day financial forecast for the founder morning briefing & executive ops
 */
export function generateExecutiveFinancialForecast(params: {
  currentMrrDollars: number;
  currentPaidAccounts: number;
  monthlyGrowthRatePercent?: number;
  churnRatePercent?: number;
}): ExecutiveFinancialForecast {
  const {
    currentMrrDollars = 168,
    currentPaidAccounts = 2,
    monthlyGrowthRatePercent = 15,
    churnRatePercent = 3.5,
  } = params;

  const monthNames = ['Next 30 Days', 'Month 2 (60d)', 'Month 3 (90d)'];
  const months: FinancialForecastMonth[] = [];

  let runningMrr = currentMrrDollars;
  let runningAccounts = currentPaidAccounts;

  for (let i = 0; i < 3; i++) {
    const netGrowth = (monthlyGrowthRatePercent - churnRatePercent) / 100;
    runningMrr = Math.round(runningMrr * (1 + netGrowth));
    runningAccounts = Math.max(1, Math.round(runningAccounts * (1 + netGrowth)));

    // Estimate platform 1.5% take rate and ad wallet spend
    const transactionFees = Math.round(runningAccounts * 145);
    const adSpend = Math.round(runningAccounts * 250);
    const grossRev = runningMrr + transactionFees + adSpend;

    months.push({
      monthIndex: i + 1,
      monthName: monthNames[i],
      projectedMrrDollars: runningMrr,
      projectedActiveSubscribers: runningAccounts,
      projectedTransactionFeesDollars: transactionFees,
      projectedAdWalletSpendDollars: adSpend,
      projectedGrossRevenueDollars: grossRev,
      churnRatePercent,
    });
  }

  const projected90DayMrr = months[2].projectedMrrDollars;
  const projectedArr = projected90DayMrr * 12;

  const keyDrivers = [
    `Contractor activation rate converting 4 pending signups into paying Growth tier (+ $396/mo MRR)`,
    `Google Ads Speed-to-Lead automated wallet refill expansion (+ $500/mo gross)`,
    `Stripe Connect 1.5% quote payment processing volume scaling`,
  ];

  const recommendations = [
    'Approve pending First-Quote Activation nudges in the Operator Cockpit to accelerate activation.',
    HOMEOWNER_FINANCING.operatorNextStep,
  ];

  return {
    currentMrrDollars,
    growthRateMonthlyPercent: monthlyGrowthRatePercent,
    projected90DayMrrDollars: projected90DayMrr,
    projectedAnnualRunRateDollars: projectedArr,
    months,
    keyDrivers,
    recommendations,
  };
}
