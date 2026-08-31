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
} from './audit';
import { generateExecutiveBriefing } from './briefing';
import { runRevOpsGrowthScan, type RevOpsScanResult } from './revops-growth';

export interface AutonomousCycleReport {
  cycleId: string;
  timestamp: string;
  briefing: ExecutiveBriefing;
  revOpsScan: RevOpsScanResult;
  pendingHitlActions: OperatorHitlActionRequest[];
  safeActionsExecuted: number;
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

  const report: AutonomousCycleReport = {
    cycleId,
    timestamp: new Date().toISOString(),
    briefing,
    revOpsScan,
    pendingHitlActions,
    safeActionsExecuted: revOpsScan.onboardingNudgesQueued,
  };

  recordOperatorAudit({
    category: 'executive',
    actionName: 'Autonomous Cycle Completed',
    severity: 'info',
    toolName: 'runAutonomousOperatorCycle',
    outputResult: {
      cycleId,
      safeActions: report.safeActionsExecuted,
      pendingHitl: pendingHitlActions.length,
    },
    reasoningSummary: `Autonomous cycle completed. ${report.safeActionsExecuted} automated actions run, ${pendingHitlActions.length} HITL approvals pending.`,
    status: 'success',
  });

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
    // Intelligent deterministic fallback if API key is not configured
    if (query.toLowerCase().includes('health') || query.toLowerCase().includes('status')) {
      const health = await executeOperatorTool('get_system_health', {}, ctx);
      return {
        answer: `**System Health Status**: ${JSON.stringify(health.data, null, 2)}`,
        toolCallsExecuted: ['get_system_health'],
        pendingHitlActions: listPendingHitlActions(),
      };
    }

    if (query.toLowerCase().includes('billing') || query.toLowerCase().includes('revenue') || query.toLowerCase().includes('dunning')) {
      const billing = await executeOperatorTool('get_revenue_and_billing_summary', { includeDisputes: true }, ctx);
      return {
        answer: `**Billing & Revenue Summary**: ${JSON.stringify(billing.data, null, 2)}`,
        toolCallsExecuted: ['get_revenue_and_billing_summary'],
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
You assist the founder by monitoring platform health, triaging contractor support cases, managing revenue dunning, reviewing SMS queue deliverability, and drafting or executing operations.

Available Tools:
- get_system_health: Check SMS errors, webhook failures, and cron job status.
- get_sms_queue_diagnostics: Detailed delivery diagnostics on SMS tasks.
- get_revenue_and_billing_summary: Summarize MRR, dunning accounts, and open Stripe disputes.
- get_contractor_account_360: Detailed 360 view of a contractor account.
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
 * Approves or rejects a pending HITL action card
 */
export function executeHitlDecision(
  actionId: string,
  decision: 'approved' | 'rejected',
  resolver: string,
  reason?: string,
) {
  return resolveHitlAction(actionId, decision, resolver, reason);
}

export { listPendingHitlActions, getOperatorAuditLogs };
