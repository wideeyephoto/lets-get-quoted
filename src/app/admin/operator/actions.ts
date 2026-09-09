'use server';

import { requireAdmin, requirePermission, requireMfaPermission } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';
import {
  runAutonomousOperatorCycle,
  askAiOperator,
  executeHitlDecision,
  type OperatorChatTurn,
} from '@/lib/ai-operator/engine';
import {
  permissionForHitlAction,
  getHitlActionByIdAsync,
  flushOperatorWrites,
} from '@/lib/ai-operator/audit';
import { triageSupportCase, diagnoseContractorOnboarding } from '@/lib/ai-operator/support-copilot';
import { executeOperatorTool } from '@/lib/ai-operator/tools';
import { dispatchExecutiveBriefingDigest } from '@/lib/ai-operator/digest';
import { generateExecutiveBriefing } from '@/lib/ai-operator/briefing';
import {
  CONTRACTOR_LIFECYCLE_STEPS,
  renderContractorLifecycleEmailHtml,
  type ContractorLifecycleStepId,
} from '@/lib/contractor-lifecycle-emails';
import { interpolateTokens } from '@/lib/admin-campaign-types';

/** How many prior turns of cockpit conversation to replay to the model. */
const MAX_HISTORY_TURNS = 12;

export async function triggerOperatorCycleAction() {
  const context = await requirePermission('ops.manage');
  const report = await runAutonomousOperatorCycle(context.admin, { adminUserId: context.adminEmail });
  await logAdminAction(context.admin, context, {
    action: 'operator.cycle_triggered',
    reason: 'Staff triggered AI operator autonomous cycle',
  });
  await flushOperatorWrites();
  return { success: true, report };
}

export async function resolveHitlActionServerAction(
  actionId: string,
  decision: 'approved' | 'rejected',
  reason?: string,
) {
  const context = await requirePermission('ops.manage');
  const action = await getHitlActionByIdAsync(actionId, context.admin);
  if (!action) {
    throw new Error(`Action "${actionId}" not found or already purged.`);
  }

  // Determine the exact permission this action needs, preventing ops.manage privilege escalation
  const requiredPermission = permissionForHitlAction(action.actionType);

  // Require MFA on high-impact money operations (refunds, payouts)
  if (requiredPermission === 'money.refund' || requiredPermission === 'money.payouts') {
    await requireMfaPermission(requiredPermission);
  } else if (requiredPermission !== 'ops.manage') {
    await requirePermission(requiredPermission);
  }

  const result = await executeHitlDecision(
    actionId,
    decision,
    context.adminEmail,
    reason,
    {
      supabase: context.admin,
      staff: context.staff,
      adminUserId: context.adminEmail,
    },
  );

  await logAdminAction(context.admin, context, {
    action: 'operator.hitl_decision',
    targetType: 'operator_action',
    targetId: actionId,
    reason: reason ?? `Decision: ${decision}`,
    meta: {
      decision,
      actionType: action.actionType,
      requiredPermission,
      executionResult: result.executionResult,
    },
  });

  await flushOperatorWrites();
  return result;
}

export async function askOperatorServerAction(
  query: string,
  history?: OperatorChatTurn[],
) {
  const context = await requireAdmin();
  const response = await askAiOperator(
    query,
    {
      supabase: context.admin,
      adminUserId: context.adminEmail,
      source: 'admin_dashboard',
      staff: context.staff,
    },
    // Capped in the client, but re-capped here: history arrives from the browser and
    // is replayed straight into the model prompt.
    history?.slice(-MAX_HISTORY_TURNS),
  );
  await flushOperatorWrites();
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
  await flushOperatorWrites();
  return triage;
}

export async function replayWebhooksServerAction(action: 'diagnose' | 'replay_and_resolve' = 'diagnose') {
  const context = await requirePermission('ops.manage');
  const res = await executeOperatorTool('replay_failed_webhooks', { action }, {
    supabase: context.admin,
    adminUserId: context.adminEmail,
    source: 'admin_dashboard',
    staff: context.staff,
  });

  await logAdminAction(context.admin, context, {
    action: action === 'diagnose' ? 'operator.webhooks_inspected' : 'operator.webhook_replay_unavailable',
    reason: `Staff initiated webhook failure ${action}`,
    meta: { result: res.data },
  });

  await flushOperatorWrites();
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

  await flushOperatorWrites();
  return result;
}

export async function previewHitlActionMessageAction(actionId: string) {
  const context = await requirePermission('ops.manage');
  const action = await getHitlActionByIdAsync(actionId, context.admin);
  if (!action) {
    return {
      success: false,
      error: `Action "${actionId}" not found or already purged.`,
      channel: 'email' as const,
      subject: '',
      fromAddress: '',
      replyTo: '',
      recipients: [] as Array<{ accountId: string; businessName: string; email: string; ageDays?: number; quotedJobs?: number }>,
      skipped: [] as Array<{ accountId: string; businessName: string; reason: string }>,
      html: '',
    };
  }

  const payload = (action.payload || {}) as Record<string, unknown>;
  const stepId = (typeof payload.stepId === 'string' ? payload.stepId : 'nudge_zero_quotes') as ContractorLifecycleStepId;
  const step = CONTRACTOR_LIFECYCLE_STEPS.find((s) => s.id === stepId);
  if (!step) {
    return {
      success: false,
      error: `Unknown contractor lifecycle step "${stepId}" for message preview.`,
      channel: 'email' as const,
      subject: '',
      fromAddress: '',
      replyTo: '',
      recipients: [] as Array<{ accountId: string; businessName: string; email: string; ageDays?: number; quotedJobs?: number }>,
      skipped: [] as Array<{ accountId: string; businessName: string; reason: string }>,
      html: '',
    };
  }

  const recipients = (Array.isArray(payload.recipients) ? payload.recipients : []) as Array<{
    accountId: string;
    businessName: string;
    email: string;
    ageDays?: number;
    quotedJobs?: number;
  }>;

  const skipped = (Array.isArray(payload.skipped) ? payload.skipped : []) as Array<{
    accountId: string;
    businessName: string;
    reason: string;
  }>;

  const fromAddress = process.env.SYSTEM_EMAIL_FROM || "Let's Get Quoted <hello@letsgetquoted.com>";
  const replyTo = step.replyTo || 'hello@letsgetquoted.com';

  // Render against first real recipient, or fallback sample if no recipients
  const sampleRecipient = recipients[0] || {
    accountId: 'sample-preview',
    businessName: 'Your Business',
    email: 'contractor@example.com',
  };

  const subject = interpolateTokens(step.subject, sampleRecipient);
  const html = renderContractorLifecycleEmailHtml(step, sampleRecipient);

  return {
    success: true,
    channel: 'email' as const,
    subject,
    fromAddress,
    replyTo,
    recipients,
    skipped,
    html,
  };
}
