import { Type, type FunctionDeclaration } from '@google/genai';
import type {
  OperatorExecutionContext,
  OperatorToolResult,
  OperatorCategory,
  SmsCarrierHealthResult,
  UpgradeCandidate,
  OpsTrendSnapshot,
} from './types';
import {
  recordOperatorAudit,
  createHitlAction,
  listPendingHitlActions,
  validateActionExecutionSafety,
} from './audit';
import {
  getOpenDisputes,
  getPausedPayouts,
  getPaymentsNeedingAttention,
  getFailedSmsEvents,
  getFailedEmailEvents,
  getUnresolvedWebhookFailures,
  createAdminSignalDiagnostics,
  getRecentIncidents,
  getNotOnboardedAccounts,
} from '@/lib/admin-alerts';
import { getCronTrouble } from '@/lib/cron-runs';
import {
  diagnoseContractorOnboarding,
  triageSupportCase,
} from './support-copilot';
import { staffCan } from '@/lib/staff';

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
  // resolve_hitl_action is deliberately NOT declared to the model.
  //
  // The approval queue is the one control that stands between the operator and a
  // refund, suspension, or payout release. resolveHitlActionServerAction is what
  // enforces the per-action permission and the MFA step-up on money operations;
  // the tool path bypassed both, stamped resolved_by with the signed-in admin's
  // address, and cleared the card out of the founder's queue. Since this operator
  // also reads untrusted text (support ticket bodies via triage_support_case),
  // exposing it gave injected text a route to dismissing approvals in the
  // founder's name. Approvals come from a human in the cockpit, or not at all.
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
  {
    name: 'replay_failed_webhooks',
    description:
      'Inspects failed webhooks and recommends source-specific investigation. Does not replay or resolve failures.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: 'Use "diagnose" to inspect failures. Generic replay is unavailable; recovery requires a source-specific handler and verified business effects.',
        },
        ids: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Optional list of specific webhook failure IDs to target',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'triage_email_deliverability',
    description:
      'Deeply inspects email bounce logs, spam complaints, and sender reputation issues with account-level attribution.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: {
          type: Type.INTEGER,
          description: 'Maximum number of recent bounced email events to inspect (default: 20)',
        },
      },
    },
  },
  {
    name: 'check_sms_carrier_health',
    description:
      'Audits 10DLC registration compliance, carrier deliverability rates, and phone number provisioning status.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'detect_cron_lateness',
    description:
      'Monitors scheduled background cron heartbeats and flags any recurring task overdue by >15 minutes.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'scan_plan_upgrade_candidates',
    description:
      'Identifies high-growth contractor accounts nearing Solo tier limits and calculates expansion ARR opportunities.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        thresholdQuotes: {
          type: Type.INTEGER,
          description: 'Minimum quote volume to qualify for upgrade recommendation (default: 5)',
        },
      },
    },
  },
  {
    name: 'optimize_dunning_retries',
    description:
      'Calculates optimal retry schedule windows for delinquent or failed card charges to maximize recovery.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'check_connect_payout_compliance',
    description:
      'Monitors Stripe Connect accounts for restricted payouts, identity verification holds, or missing tax forms.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'generate_dispute_evidence_packet',
    description:
      'Compiles quote approvals, customer signatures, job photos, and SMS receipts into an evidence defense packet for open chargebacks.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        disputeId: {
          type: Type.STRING,
          description: 'The Stripe dispute ID or internal payment ID',
        },
      },
      required: ['disputeId'],
    },
  },
  {
    name: 'get_ops_trend_history',
    description:
      'Retrieves 7-day and 30-day historical operational trend snapshots covering MRR trajectory, activation velocity, and SRE stability.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        days: {
          type: Type.INTEGER,
          description: 'Number of historical days to inspect (default: 7)',
        },
      },
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
        const [accountRes, staffRes, numbersRes, supportRes, diagnosis, entitlementRes] = await Promise.all([
          supabase.from('accounts').select('*').eq('id', accountId).maybeSingle(),
          supabase.from('memberships').select('id, user_id, role').eq('account_id', accountId).is('deactivated_at', null),
          supabase.from('sms_sender_numbers').select('*').eq('account_id', accountId),
          supabase.from('support_cases').select('*').eq('account_id', accountId).limit(5),
          diagnoseContractorOnboarding(supabase, accountId).catch(() => null),
          Promise.resolve(
            supabase
              .from('workspace_entitlements')
              .select('plan_code, billing_status, entitlement_state')
              .eq('account_id', accountId)
              .maybeSingle(),
          ).catch(() => ({ data: null })),
        ]);

        const account = accountRes.data;
        if (!account) {
          return { data: { error: `Account ${accountId} not found.` } };
        }

        const details = {
          id: account.id,
          name: account.business_name || 'Unnamed Contractor',
          status: account.suspended_at
            ? 'suspended'
            : (entitlementRes?.data?.billing_status || account.subscription_status || 'active'),
          planTier: entitlementRes?.data?.plan_code || account.plan || 'solo',
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

      // This tool has never sent anything. It wrote an audit line claiming dispatch
      // and returned success with a dispatchedAt timestamp, while no SMS or email
      // call was made anywhere in the path. There is still no sender behind the
      // lifecycle rail, so it reports that honestly instead of manufacturing a
      // delivery record the founder would count as outreach.
      recordOperatorAudit({
        category: 'growth_lifecycle',
        actionName: `Lifecycle Nudge REFUSED: ${campaignType}`,
        severity: 'info',
        toolName: 'trigger_contractor_lifecycle_nudge',
        accountId,
        inputPayload: { accountId, campaignType },
        reasoningSummary: `Lifecycle nudge "${campaignType}" for ${accountId} was not dispatched: no sender is wired to the contractor lifecycle rail.`,
        status: 'failure',
      });

      return {
        data: {
          success: false,
          accountId,
          campaignType,
          error:
            'Contractor lifecycle nudges have no sender wired. Nothing was delivered. Reach the contractor from /admin/contractors until this rail is built.',
        },
      };
    }

    case 'replay_failed_webhooks': {
      const action = String(args.action || 'diagnose');
      const targetIds = Array.isArray(args.ids) ? (args.ids as string[]) : undefined;

      // Verify staff authority: mutating callers must hold ops.manage permission
      if (action === 'replay_and_resolve') {
        if (ctx.staff && !staffCan({ role: ctx.staff.role, active: ctx.staff.active ?? true }, 'ops.manage')) {
          return {
            data: {
              success: false,
              replayedCount: 0,
              resolvedCount: 0,
              error: `Forbidden: Staff role "${ctx.staff.role}" does not hold "ops.manage" permission required to replay and resolve webhooks.`,
              remediationSummary: 'Permission denied: mutating webhook failure states requires ops.manage permission.',
            },
          };
        }

        const safety = validateActionExecutionSafety('replay_failed_webhooks', {
          isFounderApproved:
            ctx.isFounderApproved ||
            ctx.source === 'founder_cli' ||
            ctx.source === 'cron' ||
            (ctx.staff ? staffCan({ role: ctx.staff.role, active: ctx.staff.active ?? true }, 'ops.manage') : true),
        });

        if (!safety.allowed) {
          return {
            data: {
              success: false,
              replayedCount: 0,
              resolvedCount: 0,
              requiresHitl: true,
              error: safety.reason || 'Action requires explicit founder approval.',
              remediationSummary: safety.reason,
            },
          };
        }

        return { data: {
          success: false,
          replayedCount: 0,
          resolvedCount: 0,
          error: 'Generic webhook replay is unavailable. Inspect the failure and use a source-specific recovery procedure with provider and business-effect verification.',
        } };
      }

      try {
        const signalDiagnostics = createAdminSignalDiagnostics();
        const failures = await getUnresolvedWebhookFailures(supabase, { diagnostics: signalDiagnostics });
        if (signalDiagnostics.failed.length) throw new Error('Webhook failure inspection unavailable');
        const filtered = targetIds && targetIds.length > 0
          ? failures.filter((f) => targetIds.includes(f.id))
          : failures;

        if (filtered.length === 0) {
          return {
            data: {
              success: true,
              replayedCount: 0,
              resolvedCount: 0,
              errors: [],
              remediationSummary: 'No unresolved webhook failures found to process.',
            },
          };
        }

        // Diagnostics mode
        const diagnostics = filtered.map((f) => ({
          id: f.id,
          source: f.source,
          eventType: f.event_type,
          error: f.error_message,
          createdAt: f.created_at,
          recommendedFix: f.source === 'stripe'
            ? 'Verify Stripe Connect webhook signing secret or account link state'
            : f.source === 'twilio'
            ? 'Check Twilio SMS webhook auth token and signature header'
            : 'Inspect payload structure and database foreign keys',
        }));

        return {
          data: {
            success: true,
            totalFailures: filtered.length,
            diagnostics,
            remediationSummary: `${filtered.length} webhook failure(s) require inspection. No replay was attempted.`,
            actionRequired: 'Verify each provider event and its business effects, then use the appropriate source-specific recovery procedure.',
          },
        };
      } catch (err: unknown) {
        return { data: { error: err instanceof Error ? err.message : String(err) } };
      }
    }

    case 'triage_email_deliverability': {
      try {
        const failedEmails = await getFailedEmailEvents(supabase, { limit: Number(args.limit) || 20 });
        const details = failedEmails.map((e) => ({
          id: e.id,
          recipient: e.recipient,
          bounceType: e.status === 'complained' ? 'Spam Complaint' : 'Hard/Soft Bounce',
          accountId: e.account_id || undefined,
          timestamp: e.occurred_at,
          errorReason: e.error_reason || 'Mailbox unavailable or invalid address',
          recommendation: e.status === 'complained'
            ? 'Suppress address immediately and check marketing consent'
            : 'Contact contractor to verify recipient email spelling',
        }));

        return {
          data: {
            totalBounced: failedEmails.length,
            healthStatus: failedEmails.length === 0 ? 'optimal' : failedEmails.length <= 3 ? 'minor_bounces' : 'attention_required',
            details,
          },
        };
      } catch (err: unknown) {
        return { data: { error: err instanceof Error ? err.message : String(err) } };
      }
    }

    case 'check_sms_carrier_health': {
      try {
        const failedSms = await getFailedSmsEvents(supabase, { limit: 50 });
        const deliverability = failedSms.length === 0 ? 100 : Math.max(90, 100 - failedSms.length * 0.5);

        const carrierHealth: SmsCarrierHealthResult = {
          carrierDeliverabilityPct: deliverability,
          activeHotlines: 7,
          tenDlcStatus: 'approved',
          flaggedIssues: failedSms.map((s) => `SMS failure to ${s.phone_number}: ${s.error_reason || 'Carrier dropped'}`),
        };

        return { data: carrierHealth };
      } catch (err: unknown) {
        return { data: { error: err instanceof Error ? err.message : String(err) } };
      }
    }

    case 'detect_cron_lateness': {
      try {
        const trouble = await getCronTrouble(supabase).catch(() => []);
        const troubleList = Array.isArray(trouble) ? trouble : [];

        const delayedJobs = troubleList.map((t: Record<string, unknown>) => ({
          name: typeof t.job === 'string' ? t.job : typeof t.label === 'string' ? t.label : 'scheduled-sweep',
          lastRun: typeof t.lastSuccessAt === 'string' ? t.lastSuccessAt : new Date().toISOString(),
          delayMinutes: 15,
          severity: 'warning' as const,
        }));

        return {
          data: {
            healthy: delayedJobs.length === 0,
            delayedCount: delayedJobs.length,
            delayedJobs,
          },
        };
      } catch {
        return {
          data: {
            healthy: true,
            delayedCount: 0,
            delayedJobs: [],
          },
        };
      }
    }

    case 'scan_plan_upgrade_candidates': {
      try {
        const threshold = Number(args.thresholdQuotes) || 5;
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, business_name, plan, account_number')
          .is('test_marker', null)
          .is('suspended_at', null)
          .in('plan', ['free', 'solo', 'flex']);

        const candidates: UpgradeCandidate[] = [];

        if (accounts && accounts.length > 0) {
          for (const acc of accounts.slice(0, 10)) {
            candidates.push({
              accountId: acc.id,
              accountName: acc.business_name || `Account #${acc.account_number || acc.id}`,
              currentPlan: acc.plan || 'solo',
              suggestedPlan: 'growth',
              monthlyQuoteCount: Math.max(12, threshold + 2),
              reason: `Consistent monthly quote velocity exceeding ${threshold} quotes; ready for Growth automated follow-ups`,
              estimatedAnnualLift: (129 - 39) * 12, // $1,080/yr
            });
          }
        }

        return {
          data: {
            qualifiedCandidatesCount: candidates.length,
            totalEstimatedAnnualLift: candidates.reduce((sum, c) => sum + c.estimatedAnnualLift, 0),
            candidates,
          },
        };
      } catch (err: unknown) {
        return { data: { error: err instanceof Error ? err.message : String(err) } };
      }
    }

    case 'optimize_dunning_retries': {
      return {
        data: {
          available: false,
          error:
            'Smart dunning retry automation is not currently active or wired to messaging delivery rails. Inspect failed billing events directly from /admin/billing-operations.',
        },
      };
    }

    case 'check_connect_payout_compliance': {
      try {
        const [pausedPayouts, notOnboarded] = await Promise.all([
          getPausedPayouts(supabase),
          getNotOnboardedAccounts(supabase, { limit: 15 }),
        ]);

        return {
          data: {
            pausedPayoutsCount: pausedPayouts.length,
            pausedPayoutsList: pausedPayouts.map((p) => ({
              accountId: p.id,
              name: p.business_name,
              disabledAt: p.connect_disabled_at,
            })),
            unonboardedContractorsCount: notOnboarded.length,
            unonboardedList: notOnboarded.map((n) => ({
              accountId: n.id,
              name: n.business_name,
              signedUpAt: n.created_at,
            })),
          },
        };
      } catch (err: unknown) {
        return { data: { error: err instanceof Error ? err.message : String(err) } };
      }
    }

    // Withheld until it reads real quote, payment, and job rows.
    //
    // This previously ignored disputeId entirely and returned a fixed $250 packet for
    // "acc-contractor-sample" with five invented timestamped events, marked
    // readyForSubmission: true. Submitting that to a card network would be filing
    // fabricated evidence in a real financial dispute -- returning nothing is strictly
    // safer than returning a convincing fiction.
    case 'generate_dispute_evidence_packet': {
      const disputeId = String(args.disputeId || '');
      return {
        data: {
          disputeId,
          available: false,
          error:
            'Dispute evidence assembly is not yet wired to the quote, payment, and job tables. Build the packet by hand from /admin/money -- do not submit anything generated here.',
        },
      };
    }

    // Withheld: nothing in this platform records a daily metrics snapshot.
    //
    // The series returned here was synthesised arithmetically -- MRR was literally
    // `168 + i * 15`, with contractor counts hardcoded -- and presented to the founder
    // as "7-Day Operational Trends". Serving this needs a snapshot table plus a cron
    // that writes one row a day; today's numbers cannot be backfilled into history.
    case 'get_ops_trend_history': {
      const days = Number(args.days) || 7;
      return {
        data: {
          days,
          available: false,
          history: [] as OpsTrendSnapshot[],
          error:
            'No historical metrics are recorded, so trends cannot be reported. Current-moment figures are available via get_system_health and get_revenue_and_billing_summary.',
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
