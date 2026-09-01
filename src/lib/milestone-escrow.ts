export interface MilestonePaymentStage {
  stageIndex: number;
  name: string;
  description: string;
  percentOfTotal: number;
  amountCents: number;
  status: 'pending_deposit' | 'held_in_escrow' | 'in_progress' | 'verification_submitted' | 'released' | 'refunded';
  requiresPhotoVerification: boolean;
  verificationPhotoUrls?: string[];
  releasedAt?: string;
}

export interface MilestoneEscrowPlan {
  planId: string;
  quoteId: string;
  accountId: string;
  totalJobCents: number;
  stages: MilestonePaymentStage[];
  currentActiveStageIndex: number;
  isFullyReleased: boolean;
  createdAt: string;
}

/**
 * Creates standard 3-tier milestone schedule (30% Deposit, 40% Mid-Point Inspection, 30% Final Completion)
 */
export function generateDefaultMilestoneSchedule(quoteId: string, accountId: string, totalJobCents: number): MilestoneEscrowPlan {
  const depositCents = Math.round(totalJobCents * 0.30);
  const midpointCents = Math.round(totalJobCents * 0.40);
  const finalCents = totalJobCents - depositCents - midpointCents;

  const stages: MilestonePaymentStage[] = [
    {
      stageIndex: 0,
      name: 'Initial Project Deposit & Materials',
      description: 'Funds held upon quote approval to secure materials and schedule mobilization.',
      percentOfTotal: 30,
      amountCents: depositCents,
      status: 'pending_deposit',
      requiresPhotoVerification: false,
    },
    {
      stageIndex: 1,
      name: 'Mid-Point Rough-In & Structural Milestone',
      description: 'Released when mid-point framing, plumbing, or roof decking is completed.',
      percentOfTotal: 40,
      amountCents: midpointCents,
      status: 'pending_deposit',
      requiresPhotoVerification: true,
    },
    {
      stageIndex: 2,
      name: 'Final Inspection & Homeowner Sign-Off',
      description: 'Released upon final punch-list completion and warranty certificate delivery.',
      percentOfTotal: 30,
      amountCents: finalCents,
      status: 'pending_deposit',
      requiresPhotoVerification: true,
    },
  ];

  return {
    planId: `escrow_${quoteId}_${Date.now()}`,
    quoteId,
    accountId,
    totalJobCents,
    stages,
    currentActiveStageIndex: 0,
    isFullyReleased: false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Submits contractor completion photos to trigger homeowner approval and escrow milestone release
 */
export function submitMilestonePhotoVerification(
  plan: MilestoneEscrowPlan,
  stageIndex: number,
  photoUrls: string[],
): MilestoneEscrowPlan {
  const updatedStages = plan.stages.map((stage) => {
    if (stage.stageIndex === stageIndex) {
      return {
        ...stage,
        status: 'verification_submitted' as const,
        verificationPhotoUrls: photoUrls,
      };
    }
    return stage;
  });

  return {
    ...plan,
    stages: updatedStages,
  };
}
