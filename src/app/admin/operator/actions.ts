'use server';

import { requireAdmin, requirePermission } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';
import { runAutonomousOperatorCycle, askAiOperator, executeHitlDecision } from '@/lib/ai-operator/engine';
import { triageSupportCase } from '@/lib/ai-operator/support-copilot';

export async function triggerOperatorCycleAction() {
  const context = await requirePermission('ops.manage');
  const report = await runAutonomousOperatorCycle(context.admin, { adminUserId: context.adminEmail });
  await logAdminAction(context.admin, context, {
    action: 'operator.cycle_triggered',
    reason: 'Staff triggered AI operator autonomous cycle',
  });
  return { success: true, report };
}

export async function resolveHitlActionServerAction(
  actionId: string,
  decision: 'approved' | 'rejected',
  reason?: string,
) {
  const context = await requirePermission('ops.manage');
  const result = executeHitlDecision(actionId, decision, context.adminEmail, reason);
  await logAdminAction(context.admin, context, {
    action: 'operator.hitl_decision',
    targetType: 'operator_action',
    targetId: actionId,
    reason: reason ?? `Decision: ${decision}`,
    meta: { decision },
  });
  return result;
}

export async function askOperatorServerAction(query: string) {
  const context = await requireAdmin();
  const response = await askAiOperator(query, {
    supabase: context.admin,
    adminUserId: context.adminEmail,
    source: 'admin_dashboard',
  });
  return response;
}

export async function triageCaseServerAction(caseId: string, subject: string, body?: string) {
  const context = await requirePermission('account.support');
  const triage = await triageSupportCase(context.admin, { id: caseId, subject, body });
  await logAdminAction(context.admin, context, {
    action: 'operator.case_triaged',
    targetType: 'case',
    targetId: caseId,
    reason: 'Staff invoked AI support copilot triage',
  });
  return triage;
}

