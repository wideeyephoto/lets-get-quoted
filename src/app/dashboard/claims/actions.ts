'use server';

import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import {
  analyzeAdjusterScopeWithAi,
  evaluateDamageClaimFeasibilityWithAi,
  getClaimCopilotAnswerWithAi,
} from '@/lib/insurance-ai';
import {
  listInsuranceClaims,
  listInsuranceClaimSummaries,
  getInsuranceClaim,
  saveInsuranceClaim,
  deleteInsuranceClaim,
  type SupplementAnalysisResult,
  type ClaimFeasibilityAssessment,
  type InsuranceClaimRecord,
  type InsuranceClaimSummary,
  type InsuranceClaimInput,
} from '@/lib/insurance-claims';

export async function analyzeScopeWithAiAction(input: {
  scopeText: string;
  tradeSlug?: string;
}): Promise<SupplementAnalysisResult> {
  // Read-only permission: analyzing text produces no persisted claim state
  const { accountId } = await requireOfficeContext('jobs.read');

  const result = await analyzeAdjusterScopeWithAi({
    scopeText: input.scopeText,
    tradeSlug: input.tradeSlug,
    accountId,
  });

  // Persist audit record of external AI model scope processing via service_role
  // (ai_operator_logs revokes authenticated access for security)
  try {
    const admin = createAdminClient();
    const auditId = `audit-scope-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await admin.from('ai_operator_logs').insert({
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
        method: result.analysisMethod,
      },
      output_result: {
        discrepanciesCount: result.discrepancies.length,
        totalSupplement: result.totalEstimatedSupplement,
        rcv: result.parsedFigures.rcv,
        method: result.analysisMethod,
      },
      reasoning_summary: `Adjuster scope parsed (${result.analysisMethod}) for account ${accountId}. Detected ${result.discrepancies.length} potential supplements totalling $${result.totalEstimatedSupplement}.`,
      account_id: accountId,
      status: 'completed',
    });
  } catch (err) {
    // Non-blocking audit write failure
    console.error('Failed to write AI operator audit log:', err);
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
  // Read-only permission: damage viability calculation writes nothing
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
  // Read-only permission: educational UPPA/claim answering writes nothing
  const { accountId } = await requireOfficeContext('jobs.read');
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

export async function listInsuranceClaimSummariesAction(): Promise<InsuranceClaimSummary[]> {
  const { supabase, accountId } = await requireOfficeContext('jobs.read');
  return listInsuranceClaimSummaries(supabase, accountId);
}

export async function loadInsuranceClaimAction(claimId: string): Promise<InsuranceClaimRecord | null> {
  const { supabase, accountId } = await requireOfficeContext('jobs.read');
  return getInsuranceClaim(supabase, accountId, claimId);
}

export async function setSiteInsuranceClaimsEnabledAction(
  enabled: boolean
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { accountId } = await requireOfficeContext('jobs.write');
    const admin = createAdminClient();
    const { error } = await admin
      .from('sites')
      .update({ enable_insurance_intake: enabled })
      .eq('account_id', accountId);

    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Failed to update site settings' };
  }
}
