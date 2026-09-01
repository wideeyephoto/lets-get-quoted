'use server';

import { requireAdmin, requirePermission } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';
import {
  runAutonomousOperatorCycle,
  askAiOperator,
  executeHitlDecision,
} from '@/lib/ai-operator/engine';
import { triageSupportCase, diagnoseContractorOnboarding } from '@/lib/ai-operator/support-copilot';
import { executeOperatorTool } from '@/lib/ai-operator/tools';
import { dispatchExecutiveBriefingDigest } from '@/lib/ai-operator/digest';
import { generateExecutiveBriefing } from '@/lib/ai-operator/briefing';

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
    staff: context.staff,
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

export async function replayWebhooksServerAction(action: 'diagnose' | 'replay_and_resolve' = 'replay_and_resolve') {
  const context = await requirePermission('ops.manage');
  const res = await executeOperatorTool('replay_failed_webhooks', { action }, {
    supabase: context.admin,
    adminUserId: context.adminEmail,
    source: 'admin_dashboard',
    staff: context.staff,
  });

  await logAdminAction(context.admin, context, {
    action: 'operator.webhooks_replayed',
    reason: `Staff initiated webhook failure ${action}`,
    meta: { result: res.data },
  });

  return res.data;
}

export async function fetchContractor360ServerAction(accountId: string) {
  const context = await requirePermission('account.support');
  const diagnosis = await diagnoseContractorOnboarding(context.admin, accountId);
  const { data: account } = await context.admin
    .from('accounts')
    .select('id, business_name, plan, account_number, created_at, stripe_connect_id, connect_onboarded, sms_number')
    .eq('id', accountId)
    .maybeSingle();

  return { account, diagnosis };
}

export async function sendManualDigestServerAction() {
  const context = await requirePermission('ops.manage');
  const briefing = await generateExecutiveBriefing(context.admin);
  const result = await dispatchExecutiveBriefingDigest(briefing, { recipientEmail: context.adminEmail });

  await logAdminAction(context.admin, context, {
    action: 'operator.digest_dispatched',
    reason: `Staff requested on-demand executive briefing digest to ${context.adminEmail}`,
    meta: { deliveredVia: result.deliveredVia },
  });

  return result;
}
