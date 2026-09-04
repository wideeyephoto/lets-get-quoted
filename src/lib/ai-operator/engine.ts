import { GoogleGenAI, type Content } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OperatorExecutionContext,
  ExecutiveBriefing,
  OperatorHitlActionRequest,
} from './types';
import {
  OPERATOR_TOOLS_DECLARATION,
  executeOperatorTool,
} from './tools';
import {
  recordOperatorAudit,
  resolveHitlAction,
  listPendingHitlActions,
  getOperatorAuditLogs,
  getHitlActionByIdAsync,
} from './audit';
import { refundPayment } from '@/lib/payments';
import { generateExecutiveBriefing } from './briefing';
import { runRevOpsGrowthScan, type RevOpsScanResult } from './revops';

export interface AutonomousCycleReport {
  cycleId: string;
  timestamp: string;
  briefing: ExecutiveBriefing;
  revOpsScan: RevOpsScanResult;
  pendingHitlActions: OperatorHitlActionRequest[];
  safeActionsExecuted: number;
  auditLogs?: import('./types').OperatorAuditLogEntry[];
}

/**
 * Runs a complete autonomous operational cycle:
 * 1. Inspects platform health
 * 2. Scans for dunning / onboarding nudges
 * 3. Compiles the daily executive briefing
 */
export async function runAutonomousOperatorCycle(
  supabase: SupabaseClient,
  _options?: { adminUserId?: string },
): Promise<AutonomousCycleReport> {
  const cycleId = `cycle-${Date.now()}`;

  // 1. Run RevOps & Growth scan
  const revOpsScan = await runRevOpsGrowthScan(supabase, { autoDispatchNudges: true });

  // 2. Generate updated executive briefing
  const briefing = await generateExecutiveBriefing(supabase);

  // 3. Collect pending HITL actions
  const pendingHitlActions = listPendingHitlActions();

  recordOperatorAudit({
    category: 'executive',
    actionName: 'Autonomous Cycle Completed',
    severity: 'info',
    toolName: 'runAutonomousOperatorCycle',
    outputResult: {
      cycleId,
      safeActions: revOpsScan.onboardingNudgesQueued,
      pendingHitl: pendingHitlActions.length,
    },
    reasoningSummary: `Autonomous cycle completed. ${revOpsScan.onboardingNudgesQueued} automated actions run, ${pendingHitlActions.length} HITL approvals pending.`,
    status: 'success',
  });

  const auditLogs = getOperatorAuditLogs({ limit: 25 });

  const report: AutonomousCycleReport = {
    cycleId,
    timestamp: new Date().toISOString(),
    briefing,
    revOpsScan,
    pendingHitlActions,
    safeActionsExecuted: revOpsScan.onboardingNudgesQueued,
    auditLogs,
  };

  return report;
}

/**
 * Answers a natural-language founder operational query using Gemini and Operator tools
 */
export async function askAiOperator(
  query: string,
  ctx: OperatorExecutionContext,
): Promise<{
  answer: string;
  toolCallsExecuted: string[];
  pendingHitlActions: OperatorHitlActionRequest[];
}> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const toolCallsExecuted: string[] = [];

  if (!apiKey) {
    const q = query.toLowerCase();
    if (q.includes('webhook') || q.includes('failure')) {
      const webhooks = await executeOperatorTool('replay_failed_webhooks', { action: 'diagnose' }, ctx);
      return {
        answer: `**Webhook SRE Diagnostics**:\n\n${JSON.stringify(webhooks.data, null, 2)}`,
        toolCallsExecuted: ['replay_failed_webhooks'],
        pendingHitlActions: listPendingHitlActions(),
      };
    }

    if (q.includes('email') || q.includes('bounce') || q.includes('deliverability')) {
      const emailTri = await executeOperatorTool('triage_email_deliverability', {}, ctx);
      return {
        answer: `**Email Deliverability & Bounce Triage**:\n\n${JSON.stringify(emailTri.data, null, 2)}`,
        toolCallsExecuted: ['triage_email_deliverability'],
        pendingHitlActions: listPendingHitlActions(),
      };
    }

    if (q.includes('upgrade') || q.includes('candidate') || q.includes('expansion')) {
      const upgrades = await executeOperatorTool('scan_plan_upgrade_candidates', {}, ctx);
      return {
        answer: `**Plan Tier Upgrade Candidates**:\n\n${JSON.stringify(upgrades.data, null, 2)}`,
        toolCallsExecuted: ['scan_plan_upgrade_candidates'],
        pendingHitlActions: listPendingHitlActions(),
      };
    }

    if (q.includes('dispute') || q.includes('chargeback') || q.includes('evidence')) {
      const evidence = await executeOperatorTool('generate_dispute_evidence_packet', { disputeId: 'dp_sample_123' }, ctx);
      return {
        answer: `**Dispute Defense Packet**:\n\n${JSON.stringify(evidence.data, null, 2)}`,
        toolCallsExecuted: ['generate_dispute_evidence_packet'],
        pendingHitlActions: listPendingHitlActions(),
      };
    }

    if (q.includes('cron') || q.includes('lateness') || q.includes('delay')) {
      const cronLateness = await executeOperatorTool('detect_cron_lateness', {}, ctx);
      return {
        answer: `**Background Cron Lateness Monitor**:\n\n${JSON.stringify(cronLateness.data, null, 2)}`,
        toolCallsExecuted: ['detect_cron_lateness'],
        pendingHitlActions: listPendingHitlActions(),
      };
    }

    if (q.includes('trend') || q.includes('history') || q.includes('growth')) {
      const trends = await executeOperatorTool('get_ops_trend_history', { days: 7 }, ctx);
      return {
        answer: `**7-Day Operational Trends**:\n\n${JSON.stringify(trends.data, null, 2)}`,
        toolCallsExecuted: ['get_ops_trend_history'],
        pendingHitlActions: listPendingHitlActions(),
      };
    }

    if (q.includes('billing') || q.includes('revenue') || q.includes('dunning') || q.includes('payout')) {
      const billing = await executeOperatorTool('get_revenue_and_billing_summary', { includeDisputes: true }, ctx);
      return {
        answer: `**Billing & Revenue Summary**: ${JSON.stringify(billing.data, null, 2)}`,
        toolCallsExecuted: ['get_revenue_and_billing_summary'],
        pendingHitlActions: listPendingHitlActions(),
      };
    }

    if (q.includes('health') || q.includes('status') || q.includes('sre') || q.includes('incident') || q.includes('system')) {
      const health = await executeOperatorTool('get_system_health', {}, ctx);
      return {
        answer: `**System Health Status**: ${JSON.stringify(health.data, null, 2)}`,
        toolCallsExecuted: ['get_system_health'],
        pendingHitlActions: listPendingHitlActions(),
      };
    }

    if (q.includes('onboarding') || q.includes('blocker') || q.includes('nudge') || q.includes('connect')) {
      const diagnosis = await executeOperatorTool('diagnose_contractor_onboarding', { accountId: 'acc-test-123' }, ctx);
      return {
        answer: `**Onboarding Diagnostics**: ${JSON.stringify(diagnosis.data, null, 2)}`,
        toolCallsExecuted: ['diagnose_contractor_onboarding'],
        pendingHitlActions: listPendingHitlActions(),
      };
    }

    const briefing = await generateExecutiveBriefing(ctx.supabase);
    return {
      answer: briefing.markdownSummary,
      toolCallsExecuted: ['generateExecutiveBriefing'],
      pendingHitlActions: listPendingHitlActions(),
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = `You are the Autonomous AI Operations Manager and Virtual COO for "Let's Get Quoted" (LGQ) SaaS.
You assist the founder by monitoring platform health, triaging contractor support cases, managing revenue dunning, reviewing SMS queue deliverability, diagnosing onboarding blockers, and drafting or executing operations.

Available Tools:
- get_system_health: Check SMS errors, webhook failures, and cron job status.
- get_sms_queue_diagnostics: Detailed delivery diagnostics on SMS tasks.
- get_revenue_and_billing_summary: Summarize MRR, dunning accounts, and open Stripe disputes.
- get_contractor_account_360: Detailed 360 view of a contractor account.
- diagnose_contractor_onboarding: Deep diagnostics on onboarding blockers (Stripe, SMS, Quote).
- triage_support_case: Triage incoming contractor support tickets.
- create_hitl_action_request: Propose a high-impact operation requiring 1-click founder approval.
- resolve_hitl_action: Approve or reject an existing pending action request.
- list_pending_action_requests: View all active action cards awaiting approval.
- trigger_contractor_lifecycle_nudge: Send safe onboarding or re-engagement communication.

Invariants:
- Safe read-only inspections and minor nudges are executed automatically.
- High-impact mutations (refunds, forced settlements, custom trial extensions) MUST be queued as HITL action cards via create_hitl_action_request.
- Provide concise, insightful, executive-level summaries.`;

  try {
    const formattedContents: Content[] = [
      {
        role: 'user',
        parts: [{ text: query }],
      },
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: formattedContents,
      config: {
        systemInstruction,
        temperature: 0.2,
        tools: [{ functionDeclarations: OPERATOR_TOOLS_DECLARATION }],
      },
    });

    const functionCalls = response.functionCalls;
    let answerText = response.text || '';

    if (functionCalls && functionCalls.length > 0) {
      for (const call of functionCalls) {
        if (!call.name) continue;
        toolCallsExecuted.push(call.name);
        const result = await executeOperatorTool(
          call.name,
          (call.args as Record<string, unknown>) || {},
          ctx,
        );

        if (!answerText) {
          answerText = `Executed **${call.name}**: ${JSON.stringify(result.data, null, 2)}`;
        }
      }
    }

    return {
      answer: answerText || 'Operational query processed successfully.',
      toolCallsExecuted,
      pendingHitlActions: listPendingHitlActions(),
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const briefing = await generateExecutiveBriefing(ctx.supabase);
    return {
      answer: `AI Engine Note: ${errorMsg}\n\n${briefing.markdownSummary}`,
      toolCallsExecuted: ['fallback_briefing'],
      pendingHitlActions: listPendingHitlActions(),
    };
  }
}

/**
 * Approves or rejects a pending HITL action card, and actually executes the
 * underlying tool or database mutation upon approval.
 */
export async function executeHitlDecision(
  actionId: string,
  decision: 'approved' | 'rejected',
  resolver: string,
  reason?: string,
  ctx?: {
    supabase?: SupabaseClient;
    staff?: { role: import('@/lib/staff').StaffRole; email?: string; active?: boolean; id?: string; display_name?: string | null };
    adminUserId?: string;
  },
): Promise<{
  success: boolean;
  action?: OperatorHitlActionRequest;
  executionResult?: unknown;
  error?: string;
}> {
  const action = await getHitlActionByIdAsync(actionId, ctx?.supabase);
  if (!action) {
    return { success: false, error: `Action request "${actionId}" not found.` };
  }

  if (decision === 'rejected') {
    const res = resolveHitlAction(actionId, 'rejected', resolver, reason, new Date(), ctx?.supabase);
    return { success: res.success, action: res.action, error: res.error };
  }

  // Decision is 'approved': execute underlying action
  let executionResult: unknown = null;
  const supabase = ctx?.supabase;

  if (supabase) {
    try {
      const executionStaff: { role: any; active: boolean; id?: string; email?: string; display_name?: string | null } | undefined = ctx?.staff
        ? {
            role: ctx.staff.role,
            active: ctx.staff.active !== undefined ? Boolean(ctx.staff.active) : true,
            id: ctx.staff.id,
            email: ctx.staff.email,
            display_name: ctx.staff.display_name,
          }
        : undefined;

      switch (action.actionType) {
        case 'issue_subscription_refund': {
          const paymentId = action.payload.paymentId ? String(action.payload.paymentId) : null;
          const accountId = action.payload.accountId ? String(action.payload.accountId) : null;
          const amount = typeof action.payload.amountDollars === 'number' ? action.payload.amountDollars : undefined;

          if (paymentId && accountId) {
            executionResult = await refundPayment(supabase, accountId, paymentId, amount);
          } else if (accountId) {
            executionResult = {
              refundRecorded: true,
              accountId,
              amountCents: action.payload.amountCents || (amount ? amount * 100 : 0),
            };
          }
          break;
        }

        case 'modify_account_tier': {
          const accountId = String(action.payload.accountId || '');
          const targetPlan = String(action.payload.tier || action.payload.plan || '');
          if (accountId && targetPlan) {
            await supabase.from('accounts').update({ plan: targetPlan }).eq('id', accountId);
            executionResult = { accountId, plan: targetPlan, status: 'updated' };
          }
          break;
        }

        case 'waive_platform_fee': {
          const accountId = String(action.payload.accountId || '');
          if (accountId) {
            await supabase.from('accounts').update({ custom_platform_fee_bps: 0 }).eq('id', accountId);
            executionResult = { accountId, customPlatformFeeBps: 0, status: 'waived' };
          }
          break;
        }

        case 'suspend_account_access': {
          const accountId = String(action.payload.accountId || '');
          if (accountId) {
            const nowIso = new Date().toISOString();
            await supabase
              .from('accounts')
              .update({
                suspended_at: nowIso,
                suspended_reason: reason || 'Suspended via AI Operator HITL approval',
                suspended_by: resolver,
              })
              .eq('id', accountId);
            executionResult = { accountId, suspendedAt: nowIso, status: 'suspended' };
          }
          break;
        }

        case 'force_payout_settlement': {
          const accountId = String(action.payload.accountId || '');
          if (accountId) {
            await supabase
              .from('accounts')
              .update({ payouts_restricted_at: null, payouts_restricted_reason: null })
              .eq('id', accountId);
            executionResult = { accountId, payoutsRestricted: false, status: 'settlement_unlocked' };
          }
          break;
        }

        case 'extend_contractor_trial': {
          const accountId = String(action.payload.accountId || '');
          const days = Number(action.payload.days || 14);
          if (accountId) {
            const newTrialEnd = new Date(Date.now() + days * 86400000).toISOString();
            await supabase
              .from('accounts')
              .update({ trial_ends_at: newTrialEnd })
              .eq('id', accountId);
            executionResult = { accountId, trialEndsAt: newTrialEnd, extendedDays: days };
          }
          break;
        }

        case 'replay_failed_webhook':
        case 'replay_failed_webhooks': {
          const toolRes = await executeOperatorTool(
            'replay_failed_webhooks',
            { action: 'replay_and_resolve', ids: action.payload.ids },
            {
              supabase,
              adminUserId: resolver,
              staff: executionStaff,
              source: 'ai_operator_hitl',
            },
          );
          executionResult = toolRes.data;
          break;
        }

        case 'trigger_contractor_lifecycle_nudge': {
          const toolRes = await executeOperatorTool(
            'trigger_contractor_lifecycle_nudge',
            action.payload,
            {
              supabase,
              adminUserId: resolver,
              staff: executionStaff,
              source: 'ai_operator_hitl',
            },
          );
          executionResult = toolRes.data;
          break;
        }

        default: {
          const toolRes = await executeOperatorTool(
            action.actionType,
            action.payload,
            {
              supabase,
              adminUserId: resolver,
              staff: executionStaff,
              source: 'ai_operator_hitl',
            },
          );
          executionResult = toolRes.data;
          break;
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[ai-operator] Execution failed for action ${action.actionType}:`, errorMsg);
      return { success: false, error: `Execution failed: ${errorMsg}` };
    }
  }

  const res = resolveHitlAction(actionId, 'approved', resolver, reason, new Date(), supabase);
  if (res.success && supabase) {
    try {
      const q = supabase.from('ai_operator_action_requests');
      if (typeof q?.update === 'function') {
        q.update({
          execution_result: executionResult,
          executed_at: new Date().toISOString(),
        })
          .eq('id', actionId)
          .then(
            () => {},
            (err: any) => console.warn('[ai-operator] execution result persist error:', err?.message || err),
          );
      }
    } catch {
      // Mock client or unconfigured
    }
  }

  return { success: res.success, action: res.action, executionResult, error: res.error };
}

export { listPendingHitlActions, getOperatorAuditLogs };
