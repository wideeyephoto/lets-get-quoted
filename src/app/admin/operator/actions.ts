'use server';

import { createAdminClient } from '@/lib/auth';
import { runAutonomousOperatorCycle, askAiOperator, executeHitlDecision } from '@/lib/ai-operator/engine';
import { triageSupportCase } from '@/lib/ai-operator/support-copilot';

export async function triggerOperatorCycleAction() {
  const supabase = createAdminClient();
  const report = await runAutonomousOperatorCycle(supabase, { adminUserId: 'admin-action' });
  return { success: true, report };
}

export async function resolveHitlActionServerAction(
  actionId: string,
  decision: 'approved' | 'rejected',
  reason?: string,
) {
  const result = executeHitlDecision(actionId, decision, 'founder-admin', reason);
  return result;
}

export async function askOperatorServerAction(query: string) {
  const supabase = createAdminClient();
  const response = await askAiOperator(query, {
    supabase,
    adminUserId: 'founder-admin',
    source: 'admin_dashboard',
  });
  return response;
}

export async function triageCaseServerAction(caseId: string, subject: string, body?: string) {
  const supabase = createAdminClient();
  const triage = await triageSupportCase(supabase, { id: caseId, subject, body });
  return triage;
}
