'use server';

import { requireOfficeContext } from '@/lib/auth';
import {
  analyzeAdjusterScopeWithAi,
  evaluateDamageClaimFeasibilityWithAi,
  getClaimCopilotAnswerWithAi,
} from '@/lib/insurance-ai';
import {
  listInsuranceClaims,
  saveInsuranceClaim,
  deleteInsuranceClaim,
  type SupplementAnalysisResult,
  type ClaimFeasibilityAssessment,
  type InsuranceClaimRecord,
  type InsuranceClaimInput,
} from '@/lib/insurance-claims';

export async function analyzeScopeWithAiAction(input: {
  scopeText: string;
  tradeSlug?: string;
}): Promise<SupplementAnalysisResult> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');

  const result = await analyzeAdjusterScopeWithAi({
    scopeText: input.scopeText,
    tradeSlug: input.tradeSlug,
    accountId,
  });

  // Persist audit record of external AI model scope processing
  try {
    const auditId = `audit-scope-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await supabase.from('ai_operator_logs').insert({
      id: auditId,
      timestamp: new Date().toISOString(),
      category: 'insurance_claim',
      action_name: 'adjuster_scope_analysis',
      severity: 'info',
      tool_name: 'analyzeAdjusterScopeWithAi',
      input_payload: {
        tradeSlug: input.tradeSlug || 'roofers',
        scopeCharLength: input.scopeText.length,
        scopeLineCount: input.scopeText.split('\n').length,
      },
      output_result: {
        discrepanciesCount: result.discrepancies.length,
        totalSupplement: result.totalEstimatedSupplement,
        rcv: result.parsedFigures.rcv,
      },
      reasoning_summary: `Adjuster scope parsed with AI model for account ${accountId}. Detected ${result.discrepancies.length} potential supplements totalling $${result.totalEstimatedSupplement}.`,
      account_id: accountId,
      status: 'completed',
    });
  } catch {
    // Non-blocking audit write failure
  }

  return result;
}

export async function evaluateFeasibilityWithAiAction(input: {
  damageDescription: string;
  reportedPeril?: string;
  approxAgeYears?: number;
  knownDeductible?: number;
  tradeSlug?: string;
}): Promise<ClaimFeasibilityAssessment> {
  const { accountId } = await requireOfficeContext('jobs.write');
  return evaluateDamageClaimFeasibilityWithAi({
    ...input,
    accountId,
  });
}

export async function getClaimCopilotAnswerAction(input: {
  question: string;
  tradeSlug?: string;
}): Promise<string> {
  const { accountId } = await requireOfficeContext('jobs.write');
  return getClaimCopilotAnswerWithAi({
    question: input.question,
    tradeSlug: input.tradeSlug,
    accountId,
  });
}

export async function saveInsuranceClaimAction(
  input: InsuranceClaimInput
): Promise<{ ok: true; claim: InsuranceClaimRecord } | { ok: false; message: string }> {
  try {
    const { supabase, accountId } = await requireOfficeContext('jobs.write');
    const claim = await saveInsuranceClaim(supabase, accountId, input);
    return { ok: true, claim };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Failed to save insurance claim' };
  }
}

export async function deleteInsuranceClaimAction(
  claimId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { supabase, accountId } = await requireOfficeContext('jobs.write');
    await deleteInsuranceClaim(supabase, accountId, claimId);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Failed to delete insurance claim' };
  }
}

export async function listInsuranceClaimsAction(): Promise<InsuranceClaimRecord[]> {
  const { supabase, accountId } = await requireOfficeContext('jobs.read');
  return listInsuranceClaims(supabase, accountId);
}
