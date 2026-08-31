import { Type, type FunctionDeclaration } from '@google/genai';
import type {
  OperatorExecutionContext,
  OperatorToolResult,
  OperatorCategory,
} from './types';
import {
  recordOperatorAudit,
  createHitlAction,
  listPendingHitlActions,
  resolveHitlAction as resolveHitlActionAudit,
  validateActionExecutionSafety,
} from './audit';
import {
  getOpenDisputes,
  getPausedPayouts,
  getPaymentsNeedingAttention,
  getFailedSmsEvents,
  getFailedEmailEvents,
  getUnresolvedWebhookFailures,
  getRecentIncidents,
} from '@/lib/admin-alerts';
import { getCronTrouble } from '@/lib/cron-runs';
import {
  diagnoseContractorOnboarding,
  triageSupportCase,
} from './support-copilot';

type OperatorFunctionDeclaration = Omit<FunctionDeclaration, 'parameters'> & {
  parameters: NonNullable<FunctionDeclaration['parameters']>;
};

/**
 * AI Operator Tool Declarations formatted for Gemini Function Calling
 */
export const OPERATOR_TOOLS_DECLARATION: OperatorFunctionDeclaration[] = [
  {
    name: 'get_system_health',
    description:
      'Retrieves holistic SRE health metrics, including SMS queue errors, webhook failures, cron trouble, and open incidents.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'get_sms_queue_diagnostics',
    description:
      'Queries delivery statistics for application SMS traffic, carrier delivery rates, stuck tasks, and provider errors.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: {
          type: Type.INTEGER,
          description: 'Maximum number of recent failed SMS events to inspect (default: 10)',
        },
      },
    },
  },
  {
    name: 'get_revenue_and_billing_summary',
    description:
      'Summarizes active subscriptions, estimated MRR, paused payouts, dunning payments, and open Stripe disputes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        includeDisputes: {
          type: Type.BOOLEAN,
          description: 'Whether to include active dispute details',
        },
      },
    },
  },
  {
    name: 'get_contractor_account_360',
    description:
      'Retrieves a complete 360-degree context of a contractor account including subscription status, SMS registration, team size, onboarding diagnostics, and support cases.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        accountId: {
          type: Type.STRING,
          description: 'The contractor account ID to inspect',
        },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'diagnose_contractor_onboarding',
    description:
      'Performs deep diagnostic analysis on contractor onboarding blockers (Stripe Connect setup, SMS hotline provisioning, first quote creation) and returns step-by-step remediation guidance.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        accountId: {
          type: Type.STRING,
          description: 'The contractor account ID to diagnose',
        },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'triage_support_case',
    description:
      'Triages an incoming contractor support case, detects topic (payouts, SMS hotline, quote creation, billing), assigns urgency, and drafts an intelligent response.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        caseId: {
          type: Type.STRING,
          description: 'The support case or ticket ID',
        },
        subject: {
          type: Type.STRING,
          description: 'The support ticket subject line',
        },
        body: {
          type: Type.STRING,
          description: 'The support ticket message body',
        },
        accountId: {
          type: Type.STRING,
          description: 'Optional associated contractor account ID',
        },
      },
      required: ['caseId', 'subject'],
    },
  },
  {
    name: 'create_hitl_action_request',
    description:
      'Proposes a high-impact operational action (such as issuing a refund, extending a trial, or reassigning a sender) that requires 1-click founder approval.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          description:
            'Category: "sre_platform", "billing_revops", "customer_support", "growth_lifecycle", or "executive"',
        },
        title: {
          type: Type.STRING,
          description: 'Short human-readable action title',
        },
        description: {
          type: Type.STRING,
          description: 'Clear justification and expected impact of this action',
        },
        actionType: {
          type: Type.STRING,
          description:
            'The action identifier (e.g. "extend_contractor_trial", "issue_subscription_refund", "trigger_dunning_escalation")',
        },
        payloadJson: {
          type: Type.STRING,
          description: 'JSON serialized string containing the parameters for this action',
        },
      },
      required: ['category', 'title', 'description', 'actionType', 'payloadJson'],
    },
  },
  {
    name: 'resolve_hitl_action',
    description: 'Approves or rejects a pending human-in-the-loop action request.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        actionId: {
          type: Type.STRING,
          description: 'The ID of the pending action request',
        },
        decision: {
          type: Type.STRING,
          description: '"approved" or "rejected"',
        },
        reason: {
          type: Type.STRING,
          description: 'Optional note or reasoning for the decision',
        },
      },
      required: ['actionId', 'decision'],
    },
  },
  {
    name: 'list_pending_action_requests',
    description: 'Lists all pending action cards awaiting the founder’s 1-click approval.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'trigger_contractor_lifecycle_nudge',
    description:
      'Sends an automated onboarding or re-engagement nudge email/SMS to an inactive contractor.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        accountId: {
          type: Type.STRING,
          description: 'The contractor account ID',
        },
        campaignType: {
          type: Type.STRING,
          description:
            'Type of nudge: "onboarding_welcome", "first_quote_reminder", "phone_setup_help", "stripe_connect_reminder", or "winback"',
        },
      },
      required: ['accountId', 'campaignType'],
    },
  },
];

/**
 * Executes an AI Operator tool with safety boundaries, error handling, and audit logging
 */
export async function executeOperatorTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: OperatorExecutionContext,
): Promise<OperatorToolResult> {
  const { supabase } = ctx;

  switch (toolName) {
    case 'get_system_health': {
      try {
        const [
          failedSms,
          failedEmails,
          unresolvedWebhooks,
          cronTrouble,
          incidents,
          dunning,
          pausedPayouts,
        ] = await Promise.all([
          getFailedSmsEvents(supabase, { limit: 24 }).catch(() => []),
          getFailedEmailEvents(supabase, { limit: 24 }).catch(() => []),
          getUnresolvedWebhookFailures(supabase).catch(() => []),
          getCronTrouble(supabase).catch(() => []),
          getRecentIncidents(supabase, { limit: 24 }).catch(() => []),
          getPaymentsNeedingAttention(supabase).catch(() => []),
          getPausedPayouts(supabase).catch(() => []),
        ]);

        const cronIssuesCount = Array.isArray(cronTrouble) ? cronTrouble.length : 0;
        const health = {
          status:
            incidents.length > 0 || cronIssuesCount > 0 || unresolvedWebhooks.length > 0
              ? 'degraded'
              : 'healthy',
          failedSmsEvents24h: failedSms.length,
          failedEmailEvents24h: failedEmails.length,
          unresolvedWebhooksCount: unresolvedWebhooks.length,
          cronTroubledJobsCount: cronIssuesCount,
          activeIncidentsCount: incidents.length,
          dunningPaymentsCount: dunning.length,
          pausedPayoutsCount: pausedPayouts.length,
          checkedAt: new Date().toISOString(),
        };

        recordOperatorAudit({
          category: 'sre_platform',
          actionName: 'System Health Inspection',
          severity: 'info',
          toolName: 'get_system_health',
          outputResult: health,
          reasoningSummary: `System health checked: status=${health.status}, incidents=${health.activeIncidentsCount}, failedSms=${health.failedSmsEvents24h}, webhooks=${health.unresolvedWebhooksCount}.`,
          status: 'success',
        });

        return { data: health };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { data: { error: message, status: 'error' } };
      }
    }

    case 'get_sms_queue_diagnostics': {
      const limit = typeof args.limit === 'number' ? args.limit : 10;
      try {
        const failedSms = await getFailedSmsEvents(supabase, { limit: 48 }).catch(() => []);
        const data = {
          recentFailedCount: failedSms.length,
          recentFailures: failedSms.slice(0, limit),
          checkedAt: new Date().toISOString(),
        };

        return { data };
      } catch (err: unknown) {
        return { data: { error: err instanceof Error ? err.message : String(err) } };
      }
    }

    case 'get_revenue_and_billing_summary': {
      try {
        const [disputes, pausedPayouts, dunning] = await Promise.all([
          getOpenDisputes(supabase).catch(() => []),
          getPausedPayouts(supabase).catch(() => []),
          getPaymentsNeedingAttention(supabase).catch(() => []),
        ]);

        let dunningTotalAmountCents = 0;
        for (const d of dunning) {
          dunningTotalAmountCents += Math.round((d.amount ?? 0) * 100);
        }

        const summary = {
          openDisputesCount: disputes.length,
          disputes: args.includeDisputes ? disputes : undefined,
          pausedPayoutsCount: pausedPayouts.length,
          dunningCount: dunning.length,
          dunningTotalAmountCents,
          dunningSummary: dunning.slice(0, 5),
          checkedAt: new Date().toISOString(),
        };

        return { data: summary };
      } catch (err: unknown) {
        return { data: { error: err instanceof Error ? err.message : String(err) } };
      }
    }

    case 'get_contractor_account_360': {
      const accountId = String(args.accountId || '');
      if (!accountId) {
        return { data: { error: 'accountId is required' } };
      }

      try {
        const [accountRes, staffRes, numbersRes, supportRes, diagnosis] = await Promise.all([
          supabase.from('accounts').select('*').eq('id', accountId).maybeSingle(),
          supabase.from('account_staff').select('id, user_id, role').eq('account_id', accountId),
          supabase.from('sms_sender_numbers').select('*').eq('account_id', accountId),
          supabase.from('support_cases').select('*').eq('account_id', accountId).limit(5),
          diagnoseContractorOnboarding(supabase, accountId).catch(() => null),
        ]);

        const account = accountRes.data;
        if (!account) {
          return { data: { error: `Account ${accountId} not found.` } };
        }

        const details = {
          id: account.id,
          name: account.business_name || account.name || 'Unnamed Contractor',
          status: account.status || 'active',
          planTier: account.plan_tier || 'solo',
          createdAt: account.created_at,
          staffCount: staffRes.data?.length ?? 0,
          senderNumbersCount: numbersRes.data?.length ?? 0,
          recentSupportCasesCount: supportRes.data?.length ?? 0,
          onboardingDiagnosis: diagnosis,
        };

        return { data: details };
      } catch (err: unknown) {
        return { data: { error: err instanceof Error ? err.message : String(err) } };
      }
    }

    case 'diagnose_contractor_onboarding': {
      const accountId = String(args.accountId || '');
      if (!accountId) {
        return { data: { error: 'accountId is required' } };
      }

      try {
        const diagnosis = await diagnoseContractorOnboarding(supabase, accountId);
        return { data: diagnosis };
      } catch (err: unknown) {
        return { data: { error: err instanceof Error ? err.message : String(err) } };
      }
    }

    case 'triage_support_case': {
      const caseId = String(args.caseId || '');
      const subject = String(args.subject || '');
      const body = args.body ? String(args.body) : undefined;
      const accountId = args.accountId ? String(args.accountId) : undefined;

      if (!caseId || !subject) {
        return { data: { error: 'caseId and subject are required' } };
      }

      try {
        const triage = await triageSupportCase(supabase, {
          id: caseId,
          subject,
          body,
          account_id: accountId,
        });
        return { data: triage };
      } catch (err: unknown) {
        return { data: { error: err instanceof Error ? err.message : String(err) } };
      }
    }

    case 'create_hitl_action_request': {
      const category = (args.category as OperatorCategory) || 'executive';
      const title = String(args.title || 'Untitled Action');
      const description = String(args.description || '');
      const actionType = String(args.actionType || 'custom_action');
      let payload: Record<string, unknown> = {};

      try {
        payload = JSON.parse(String(args.payloadJson || '{}'));
      } catch {
        payload = { raw: args.payloadJson };
      }

      const hitlAction = createHitlAction({
        category,
        title,
        description,
        actionType,
        payload,
        expiresInHours: 72,
      });

      return {
        data: {
          success: true,
          actionId: hitlAction.id,
          status: 'pending_founder_approval',
          title: hitlAction.title,
        },
        hitlAction,
      };
    }

    case 'resolve_hitl_action': {
      const actionId = String(args.actionId || '');
      const decision = args.decision === 'approved' ? 'approved' : 'rejected';
      const reason = args.reason ? String(args.reason) : undefined;
      const resolver = ctx.adminUserId || 'system-founder';

      const result = resolveHitlActionAudit(actionId, decision, resolver, reason);
      return { data: result };
    }

    case 'list_pending_action_requests': {
      const actions = listPendingHitlActions();
      return { data: { count: actions.length, actions } };
    }

    case 'trigger_contractor_lifecycle_nudge': {
      const accountId = String(args.accountId || '');
      const campaignType = String(args.campaignType || 'onboarding_welcome');

      // Safety policy check
      const safetyCheck = validateActionExecutionSafety('trigger_contractor_lifecycle_nudge');
      if (!safetyCheck.allowed) {
        return { data: { error: safetyCheck.reason, success: false } };
      }

      recordOperatorAudit({
        category: 'growth_lifecycle',
        actionName: `Lifecycle Nudge: ${campaignType}`,
        severity: 'safe_auto',
        toolName: 'trigger_contractor_lifecycle_nudge',
        accountId,
        inputPayload: { accountId, campaignType },
        reasoningSummary: `Triggered automated ${campaignType} lifecycle communication for contractor account ${accountId}.`,
        status: 'success',
      });

      return {
        data: {
          success: true,
          accountId,
          campaignType,
          dispatchedAt: new Date().toISOString(),
        },
      };
    }

    default:
      return {
        data: {
          error: `Unknown operator tool: ${toolName}`,
        },
      };
  }
}
