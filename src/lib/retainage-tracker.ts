/**
 * Retainage & Punch List Escrow Holdback Tracker
 *
 * Tracks commercial contract retainage percentages (5%–10%), escrow aging,
 * substantial completion milestones, and generates formal Demands for Retainage Release.
 */

import { toIntegerCents, fromIntegerCents, formatExactUsd } from '@/lib/financial-precision';

export type RetainageRecord = {
  id: string;
  jobId: string;
  jobRef: string;
  clientName: string;
  projectAddress: string;
  contractTotal: number;
  retainageRatePercent: number;
  withheldRetainageAmount: number;
  formattedWithheldAmount: string;
  substantialCompletionDate: string;
  daysSinceCompletion: number;
  status: 'held_in_escrow' | 'release_requested' | 'released' | 'overdue_statutory_interest';
  statutoryGracePeriodDays: number;
};

/**
 * Calculates retainage amounts in exact integer cents.
 */
export function calculateRetainageCents(
  contractTotalDollars: number | string,
  ratePercent: number = 10,
): {
  contractTotalCents: number;
  retainageCents: number;
  retainageDollars: number;
  formattedRetainage: string;
} {
  const contractTotalCents = toIntegerCents(contractTotalDollars);
  const rate = Math.max(0, Math.min(20, ratePercent));
  const retainageCents = Math.round((contractTotalCents * rate) / 100);
  const retainageDollars = fromIntegerCents(retainageCents);

  return {
    contractTotalCents,
    retainageCents,
    retainageDollars,
    formattedRetainage: formatExactUsd(retainageDollars),
  };
}

/**
 * Compiles a formal Demand for Release of Retainage document.
 */
export function generateRetainageReleaseDemand(params: {
  claimantName: string;
  customerName: string;
  projectAddress: string;
  jobRef: string;
  contractTotal: number;
  retainageAmount: number;
  substantialCompletionDate: string;
  punchListCompleted: boolean;
}): {
  title: string;
  demandDate: string;
  body: string;
  amountFormatted: string;
} {
  const amountFormatted = formatExactUsd(params.retainageAmount);
  const demandDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const body = [
    `DEMAND FOR RELEASE OF RETAINAGE FUNDS`,
    `Date of Demand: ${demandDate}`,
    ``,
    `TO: ${params.customerName}`,
    `PROJECT: ${params.projectAddress} (Ref: ${params.jobRef})`,
    `FROM: ${params.claimantName}`,
    ``,
    `Dear Property Owner / Project Manager,`,
    ``,
    `Please be advised that all scope of work under Contract ${params.jobRef} was substantially completed on ${params.substantialCompletionDate}. All punch list items, final inspections, and warranty obligations have been fully satisfied.`,
    ``,
    `Pursuant to applicable statutory prompt payment laws and contract provisions, the withheld retainage sum of ${amountFormatted} (${((params.retainageAmount / params.contractTotal) * 100).toFixed(1)}% of total contract value ${formatExactUsd(params.contractTotal)}) is now past due and payable in full.`,
    ``,
    `Please remit payment of ${amountFormatted} within ten (10) business days from the receipt of this notice to avoid statutory interest accrual and administrative collection remedies.`,
    ``,
    `Respectfully Submitted,`,
    `${params.claimantName}`,
  ].join('\n');

  return {
    title: 'Formal Demand for Release of Retainage',
    demandDate,
    body,
    amountFormatted,
  };
}
