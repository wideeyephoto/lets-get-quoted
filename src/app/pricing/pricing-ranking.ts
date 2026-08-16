import type { PlanId } from './pricing-catalog';

const PLAN_CAPABILITY_ORDER: Record<PlanId, number> = {
  flex: 0,
  solo: 1,
  growth: 2,
  scale: 3,
};

export type PlanCostCandidate = {
  planId: PlanId;
  annualCost: number | null;
};

export function rankPlanCosts(candidates: readonly PlanCostCandidate[]) {
  const ranked = candidates
    .filter((candidate): candidate is PlanCostCandidate & { annualCost: number } => candidate.annualCost !== null)
    .sort((left, right) =>
      left.annualCost - right.annualCost
      || PLAN_CAPABILITY_ORDER[right.planId] - PLAN_CAPABILITY_ORDER[left.planId],
    );

  const winner = ranked[0] ?? null;
  const tiedPlanIds = winner
    ? ranked.filter((candidate) => candidate.annualCost === winner.annualCost).map((candidate) => candidate.planId)
    : [];
  const runnerUp = winner
    ? ranked.find((candidate) => candidate.annualCost > winner.annualCost) ?? null
    : null;

  return { ranked, winner, tiedPlanIds, runnerUp };
}
