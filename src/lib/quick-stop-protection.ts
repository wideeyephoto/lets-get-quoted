export interface NoShowClaimRequest {
  bookingId: string;
  accountId: string;
  homeownerName: string;
  homeownerPhone?: string;
  scheduledArrivalWindow: string;
  contractorArrivedAt: string;
  cancellationNoticeHours: number;
  reason: 'homeowner_not_present' | 'cancelled_under_2h' | 'gate_locked_no_access';
  dispatchFeeDollars?: number;
}

export interface NoShowClaimResult {
  claimId: string;
  eligibleForFee: boolean;
  feeAmountDollars: number;
  explanation: string;
  status: 'approved' | 'rejected' | 'pending_review';
}

/**
 * Evaluates whether a cancelled or missed field visit qualifies for the $50 quick-stop trip charge protection
 */
export function evaluateNoShowProtectionClaim(req: NoShowClaimRequest): NoShowClaimResult {
  const feeAmountDollars = req.dispatchFeeDollars || 50;
  const claimId = `claim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  if (req.cancellationNoticeHours < 2 || req.reason === 'homeowner_not_present' || req.reason === 'gate_locked_no_access') {
    return {
      claimId,
      eligibleForFee: true,
      feeAmountDollars,
      explanation: `Qualified for $${feeAmountDollars} dispatch trip charge: Notice was under 2 hours or homeowner was absent upon field worker arrival.`,
      status: 'approved',
    };
  }

  return {
    claimId,
    eligibleForFee: false,
    feeAmountDollars: 0,
    explanation: `Not eligible for fee: Cancellation notice was ${req.cancellationNoticeHours} hours before arrival window (greater than 2h policy).`,
    status: 'rejected',
  };
}
