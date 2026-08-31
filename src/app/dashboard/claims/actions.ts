'use server';

import { requireOfficeContext } from '@/lib/auth';
import {
  analyzeAdjusterScopeWithAi,
  evaluateDamageClaimFeasibilityWithAi,
  getClaimCopilotAnswerWithAi,
} from '@/lib/insurance-ai';
import type {
  SupplementAnalysisResult,
  ClaimFeasibilityAssessment,
} from '@/lib/insurance-claims';

export async function analyzeScopeWithAiAction(input: {
  scopeText: string;
  tradeSlug?: string;
}): Promise<SupplementAnalysisResult> {
  const { accountId } = await requireOfficeContext('jobs.read');
  return analyzeAdjusterScopeWithAi({
    scopeText: input.scopeText,
    tradeSlug: input.tradeSlug,
    accountId,
  });
}

export async function evaluateFeasibilityWithAiAction(input: {
  damageDescription: string;
  reportedPeril?: string;
  approxAgeYears?: number;
  knownDeductible?: number;
  tradeSlug?: string;
}): Promise<ClaimFeasibilityAssessment> {
  const { accountId } = await requireOfficeContext('jobs.read');
  return evaluateDamageClaimFeasibilityWithAi({
    ...input,
    accountId,
  });
}

export async function getClaimCopilotAnswerAction(input: {
  question: string;
  tradeSlug?: string;
}): Promise<string> {
  const { accountId } = await requireOfficeContext('jobs.read');
  return getClaimCopilotAnswerWithAi({
    question: input.question,
    tradeSlug: input.tradeSlug,
    accountId,
  });
}
