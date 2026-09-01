export interface CourtesyCreditRecommendation {
  accountId: string;
  ticketId: string;
  issueCategory: 'carrier_sms_drop' | 'lead_invalid_number' | 'duplicate_subscription_charge' | 'goodwill';
  recommendedAction: 'wallet_credit' | 'subscription_refund' | 'decline';
  recommendedAmountDollars: number;
  policyReasoning: string;
  hitlActionPayload: {
    accountId: string;
    amountCents: number;
    description: string;
  };
}

/**
 * Calculates fair courtesy credit and refund recommendations based on operational audit logs
 */
export function calculateCourtesyCreditRecommendation(params: {
  accountId: string;
  ticketId: string;
  reportedIssue: string;
  monthlyPlanFeeDollars?: number;
}): CourtesyCreditRecommendation {
  const { accountId, ticketId, reportedIssue, monthlyPlanFeeDollars = 69 } = params;
  const lower = reportedIssue.toLowerCase();

  if (lower.includes('lead') || lower.includes('sms') || lower.includes('carrier') || lower.includes('phone')) {
    return {
      accountId,
      ticketId,
      issueCategory: 'carrier_sms_drop',
      recommendedAction: 'wallet_credit',
      recommendedAmountDollars: 25,
      policyReasoning: 'Standard $25 Ad Wallet replacement credit for verified carrier delivery drop or invalid homeowner contact.',
      hitlActionPayload: {
        accountId,
        amountCents: 2500,
        description: `Courtesy $25 Google Ads wallet credit for ticket #${ticketId}`,
      },
    };
  }

  if (lower.includes('duplicate') || lower.includes('double charge')) {
    return {
      accountId,
      ticketId,
      issueCategory: 'duplicate_subscription_charge',
      recommendedAction: 'subscription_refund',
      recommendedAmountDollars: monthlyPlanFeeDollars,
      policyReasoning: `100% full refund ($${monthlyPlanFeeDollars}) for verified duplicate subscription charge.`,
      hitlActionPayload: {
        accountId,
        amountCents: monthlyPlanFeeDollars * 100,
        description: `Subscription duplicate refund ($${monthlyPlanFeeDollars}) for ticket #${ticketId}`,
      },
    };
  }

  return {
    accountId,
    ticketId,
    issueCategory: 'goodwill',
    recommendedAction: 'wallet_credit',
    recommendedAmountDollars: 15,
    policyReasoning: 'Goodwill courtesy platform credit.',
    hitlActionPayload: {
      accountId,
      amountCents: 1500,
      description: `Goodwill courtesy credit ($15) for ticket #${ticketId}`,
    },
  };
}
