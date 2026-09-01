import { describe, expect, it, beforeEach } from 'vitest';
import { OPERATOR_TOOLS_DECLARATION, executeOperatorTool } from '@/lib/ai-operator/tools';
import {
  recordOperatorAudit,
  getOperatorAuditLogs,
  createHitlAction,
  listPendingHitlActions,
  resolveHitlAction,
  clearOperatorMemory,
  isHitlActionExpired,
  isActionSafeForAutoRemediation,
  validateActionExecutionSafety,
  SAFE_AUTO_REMEDIATION_ACTION_TYPES,
  REQUIRES_APPROVAL_ACTION_TYPES,
} from '@/lib/ai-operator/audit';
import {
  diagnoseContractorOnboarding,
  triageSupportCase,
} from '@/lib/ai-operator/support-copilot';
import { runRevOpsGrowthScan } from '@/lib/ai-operator/revops';
import { generateExecutiveBriefing } from '@/lib/ai-operator/briefing';
import { runAutonomousOperatorCycle, askAiOperator } from '@/lib/ai-operator/engine';
import { isSafeReadOnlySqlQuery } from '@/lib/ai-operator/sql-interpreter';
import type { OperatorExecutionContext } from '@/lib/ai-operator/types';

// Configurable Mock Supabase client for unit testing
function createMockSupabase(overrides?: {
  subscriptions?: Array<{ plan_code: string; billing_interval: string | null; status: string }>;
  accountsCount?: number;
  newAccountsCount?: number;
  onboardedCount?: number;
  accountRow?: any;
  stripeConnected?: any;
  smsSenderNumbers?: any[];
  jobsCount?: number;
}): any {
  return {
    from: (table: string) => {
      const builder: any = {
        select: (_cols?: string, options?: any) => {
          const isCount = options?.count === 'exact';
          if (isCount) {
            const countBuilder: any = {
              is: () => countBuilder,
              eq: (_col: string, val: any) => {
                if (table === 'accounts') {
                  if (val === 'active') {
                    return Promise.resolve({ count: overrides?.accountsCount ?? 50, data: [] });
                  }
                  if (val === true) {
                    return Promise.resolve({ count: overrides?.newAccountsCount ?? 6, data: [] });
                  }
                  if (val === false) {
                    return Promise.resolve({ count: overrides?.onboardedCount ?? 5, data: [] });
                  }
                }
                if (table === 'jobs') {
                  const jCount = overrides?.jobsCount !== undefined ? overrides.jobsCount : 3;
                  const resPromise = Promise.resolve({ count: jCount, data: [] });
                  (resPromise as any).eq = () => Promise.resolve({ count: jCount, data: [] });
                  return resPromise;
                }
                return Promise.resolve({ count: 0, data: [] });
              },
              gte: () => Promise.resolve({ count: overrides?.newAccountsCount ?? 6, data: [] }),
              in: () => Promise.resolve({ count: 0, data: [] }),
              not: () => Promise.resolve({ count: 0, data: [] }),
              then: (resolve: any, reject?: any) => {
                return Promise.resolve({ count: overrides?.accountsCount ?? 50, data: [] }).then(resolve, reject);
              },
            };
            return countBuilder;

          }
          return builder;
        },
        eq: (col: string, val: any) => {
          if (table === 'stripe_connected_accounts' && col === 'account_id') {
            return {
              maybeSingle: () =>
                Promise.resolve({
                  data:
                    overrides?.stripeConnected !== undefined
                      ? overrides.stripeConnected
                      : { id: 'acct_123', charges_enabled: true, payouts_enabled: true },
                }),
            };
          }
          if (table === 'accounts' && col === 'id') {
            return {
              maybeSingle: () =>
                Promise.resolve({
                  data:
                    overrides?.accountRow !== undefined
                      ? { id: val, ...overrides.accountRow }
                      : {
                          id: val,
                          name: 'Apex Roofing LLC',
                          business_name: 'Apex Roofing Pro',
                          plan_tier: 'crew',
                          status: 'active',
                          connect_onboarded: true,
                          created_at: '2026-08-01T00:00:00Z',
                        },
                }),
            };
          }
          if (table === 'sms_sender_numbers' && col === 'account_id') {
            return {
              limit: () =>
                Promise.resolve({
                  data:
                    overrides?.smsSenderNumbers !== undefined
                      ? overrides.smsSenderNumbers
                      : [{ id: 'num_1', status: 'active', phone_number: '+19479412323' }],
                }),
            };
          }
          return builder;
        },
        in: (col: string, val: any) => {
          if (table === 'billing_subscriptions' && col === 'status') {
            return {
              is: () =>
                Promise.resolve({
                  data:
                    overrides?.subscriptions !== undefined
                      ? overrides.subscriptions
                      : [
                          { plan_code: 'solo', billing_interval: 'monthly', status: 'active' },
                          { plan_code: 'growth', billing_interval: 'annual', status: 'active' },
                          { plan_code: 'scale', billing_interval: 'monthly', status: 'active' },
                        ],
                  error: null,
                }),
            };
          }
          return builder;
        },
        is: () => builder,
        not: () => builder,
        limit: () => Promise.resolve({ data: [] }),
        order: () => builder,
        gte: () => builder,
        maybeSingle: () => Promise.resolve({ data: null }),
        then: (fn: any) => fn({ data: [], error: null }),
      };
      return builder;
    },
  };
}

describe('AI Operator Framework - Tool Declarations & Schemas', () => {
  it('registers all required operational tools in OPERATOR_TOOLS_DECLARATION', () => {
    const names = OPERATOR_TOOLS_DECLARATION.map((t) => t.name);
    expect(names).toContain('get_system_health');
    expect(names).toContain('get_sms_queue_diagnostics');
    expect(names).toContain('get_revenue_and_billing_summary');
    expect(names).toContain('get_contractor_account_360');
    expect(names).toContain('diagnose_contractor_onboarding');
    expect(names).toContain('triage_support_case');
    expect(names).toContain('create_hitl_action_request');
    expect(names).toContain('resolve_hitl_action');
    expect(names).toContain('list_pending_action_requests');
    expect(names).toContain('trigger_contractor_lifecycle_nudge');
  });

  it('validates schema requirements for create_hitl_action_request', () => {
    const tool = OPERATOR_TOOLS_DECLARATION.find((t) => t.name === 'create_hitl_action_request');
    expect(tool).toBeDefined();
    expect(tool?.parameters.required).toEqual([
      'category',
      'title',
      'description',
      'actionType',
      'payloadJson',
    ]);
  });
});

describe('Executive Morning Briefing & Autonomous 24h Roll-Up', () => {
  it('calculates accurate MRR from active subscriptions across plan tiers', async () => {
    const mockSupabase = createMockSupabase({
      subscriptions: [
        { plan_code: 'solo', billing_interval: 'monthly', status: 'active' }, // $39
        { plan_code: 'solo', billing_interval: 'annual', status: 'active' },  // $35 ($420/12)
        { plan_code: 'growth', billing_interval: 'monthly', status: 'active' }, // $129
        { plan_code: 'growth', billing_interval: 'annual', status: 'active' },  // $99 ($1188/12)
        { plan_code: 'scale', billing_interval: 'monthly', status: 'active' },  // $329
        { plan_code: 'scale', billing_interval: 'annual', status: 'active' },   // $299 ($3588/12)
        { plan_code: 'flex', billing_interval: null, status: 'active' },        // $0
      ],
      accountsCount: 50,
      newAccountsCount: 6,
      onboardedCount: 8,
    });

    const briefing = await generateExecutiveBriefing(mockSupabase, { periodLabel: 'Last 24 Hours' });

    // 39 + 35 + 129 + 99 + 329 + 299 = $930/mo MRR
    expect(briefing.revenue.mrrEstimated).toBe(930);
    expect(briefing.revenue.activeSubscriptions).toBe(6);
    expect(briefing.revenue.paidPlanCounts.solo).toBe(2);
    expect(briefing.revenue.paidPlanCounts.growth).toBe(2);
    expect(briefing.revenue.paidPlanCounts.scale).toBe(2);

    expect(briefing.contractors.totalActive).toBe(50);
    expect(briefing.contractors.onboardedInPeriod).toBe(6);
    expect(briefing.contractors.unactivatedCount).toBe(8);

    expect(briefing.markdownSummary).toContain('Founder Morning Briefing (Last 24 Hours)');
    expect(briefing.markdownSummary).toContain('Estimated MRR');
    expect(briefing.markdownSummary).toContain('$930/mo');
    expect(briefing.markdownSummary).toContain('Platform & SRE Health');
  });

  it('reports healthy operational status when no critical incidents exist', async () => {
    const mockSupabase = createMockSupabase();
    const briefing = await generateExecutiveBriefing(mockSupabase);

    expect(briefing.operations.queueHealth).toBe('healthy');
    expect(briefing.operations.cronStatus).toBe('ok');
    expect(briefing.headline).toContain('Running Smoothly & Healthy');
  });
});

describe('Support Copilot & Contractor Onboarding Blocker Diagnostics', () => {
  it('diagnoses all 3 blockers (Stripe, SMS, Quote) when contractor is unonboarded', async () => {
    const mockSupabase = createMockSupabase({
      stripeConnected: null,
      accountRow: { connect_onboarded: false },
      smsSenderNumbers: [],
      jobsCount: 0,
    });

    const diagnosis = await diagnoseContractorOnboarding(mockSupabase, 'acc-unonboarded');
    expect(diagnosis.isStripeConnected).toBe(false);
    expect(diagnosis.hasSmsSenderNumber).toBe(false);
    expect(diagnosis.quotesCount).toBe(0);
    expect(diagnosis.status).toBe('critically_blocked');
    expect(diagnosis.blockers.length).toBe(3);

    // Verify structured remediation steps
    const codes = diagnosis.blockerDetails.map((b) => b.code);
    expect(codes).toContain('stripe_connect_missing');
    expect(codes).toContain('sms_hotline_missing');
    expect(codes).toContain('first_quote_missing');

    const stripeDetail = diagnosis.blockerDetails.find((b) => b.code === 'stripe_connect_missing');
    expect(stripeDetail?.severity).toBe('high');
    expect(stripeDetail?.remediationSteps.some((s) => s.includes('Payments'))).toBe(true);

    const smsDetail = diagnosis.blockerDetails.find((b) => b.code === 'sms_hotline_missing');
    expect(smsDetail?.severity).toBe('high');
    expect(smsDetail?.remediationSteps.some((s) => s.includes('Field Hotline'))).toBe(true);

    const quoteDetail = diagnosis.blockerDetails.find((b) => b.code === 'first_quote_missing');
    expect(quoteDetail?.severity).toBe('medium');
    expect(quoteDetail?.remediationSteps.some((s) => s.includes('AI Copilot') || s.includes('New Quote'))).toBe(true);
  });

  it('diagnoses missing SMS hotline when Stripe is connected but hotline is unassigned', async () => {
    const mockSupabase = createMockSupabase({
      stripeConnected: { id: 'acct_1', charges_enabled: true },
      smsSenderNumbers: [],
      jobsCount: 4,
    });

    const diagnosis = await diagnoseContractorOnboarding(mockSupabase, 'acc-no-sms');
    expect(diagnosis.isStripeConnected).toBe(true);
    expect(diagnosis.hasSmsSenderNumber).toBe(false);
    expect(diagnosis.status).toBe('partially_blocked');
    expect(diagnosis.suggestedNudgeCampaign).toBe('phone_setup_help');
  });

  it('reports account fully healthy when all onboarding milestones are complete', async () => {
    const mockSupabase = createMockSupabase({
      stripeConnected: { id: 'acct_1', charges_enabled: true, payouts_enabled: true },
      smsSenderNumbers: [{ id: 'num_1', status: 'active' }],
      jobsCount: 10,
    });

    const diagnosis = await diagnoseContractorOnboarding(mockSupabase, 'acc-complete');
    expect(diagnosis.blockers.length).toBe(0);
    expect(diagnosis.status).toBe('fully_activated');
    expect(diagnosis.recommendedAction).toContain('fully operational and healthy');
  });
});

describe('Support Copilot Ticket Triaging & Topic Taxonomy', () => {
  const mockSupabase = createMockSupabase();

  it('triages Stripe Connect onboarding tickets with KYC guidance', async () => {
    const triage = await triageSupportCase(mockSupabase, {
      id: 'case-1',
      subject: 'Help with Stripe Connect KYC identity verification',
      body: 'My charges are not enabled yet, where do I upload bank details?',
    });

    expect(triage.identifiedTopic).toBe('stripe_connect_onboarding');
    expect(triage.urgency).toBe('high');
    expect(triage.suggestedCustomerReply).toContain('Settings > Payments & Payouts');
    expect(triage.suggestedInternalAction).toContain('charges_enabled');
  });

  it('triages Stripe payout timing tickets', async () => {
    const triage = await triageSupportCase(mockSupabase, {
      id: 'case-2',
      subject: 'When do Stripe payouts deposit to my bank?',
      body: 'I collected $3,500 from a customer yesterday.',
    });

    expect(triage.identifiedTopic).toBe('stripe_payouts');
    expect(triage.urgency).toBe('high');
    expect(triage.suggestedCustomerReply).toContain('payout');
  });

  it('triages Field Hotline SMS provisioning inquiries', async () => {
    const triage = await triageSupportCase(mockSupabase, {
      id: 'case-3',
      subject: 'How do I pick a local phone number for my Field Hotline?',
      body: 'We want a 214 area code for customer text messaging.',
    });

    expect(triage.identifiedTopic).toBe('sms_phone');
    expect(triage.suggestedCustomerReply).toContain('Settings > Field Hotline');
  });

  it('triages First Quote creation inquiries', async () => {
    const triage = await triageSupportCase(mockSupabase, {
      id: 'case-4',
      subject: 'How to create quote with AI Estimator',
      body: 'Want to send proposal for bathroom remodel with line items.',
    });

    expect(triage.identifiedTopic).toBe('quote_creation');
    expect(triage.suggestedCustomerReply).toContain('New Quote');
  });

  it('triages billing inquiries with high urgency and founder escalation', async () => {
    const triage = await triageSupportCase(mockSupabase, {
      id: 'case-5',
      subject: 'Requesting refund for duplicate invoice charge',
      body: 'We were billed twice for the add-on.',
    });

    expect(triage.identifiedTopic).toBe('billing');
    expect(triage.urgency).toBe('high');
    expect(triage.requiresFounderReview).toBe(true);
  });
});

describe('Human-in-the-Loop (HITL) Action Approvals & Safety Guards', () => {
  beforeEach(() => {
    clearOperatorMemory();
  });

  it('classifies actions accurately between safe auto-remediation vs required approval', () => {
    // Safe actions
    expect(isActionSafeForAutoRemediation('trigger_contractor_lifecycle_nudge')).toBe(true);
    expect(isActionSafeForAutoRemediation('system_health_probe')).toBe(true);
    expect(isActionSafeForAutoRemediation('triage_support_case')).toBe(true);
    expect(isActionSafeForAutoRemediation('generate_executive_briefing')).toBe(true);

    // High impact actions requiring approval
    expect(isActionSafeForAutoRemediation('issue_subscription_refund')).toBe(false);
    expect(isActionSafeForAutoRemediation('trigger_dunning_escalation')).toBe(false);
    expect(isActionSafeForAutoRemediation('extend_contractor_trial')).toBe(false);
    expect(isActionSafeForAutoRemediation('modify_account_tier')).toBe(false);
    expect(isActionSafeForAutoRemediation('suspend_account_access')).toBe(false);
    expect(isActionSafeForAutoRemediation('reassign_sms_number')).toBe(false);
    expect(isActionSafeForAutoRemediation('waive_platform_fee')).toBe(false);
  });

  it('enforces safety guard: blocks high-impact actions from zero-touch auto execution', () => {
    const refundSafety = validateActionExecutionSafety('issue_subscription_refund', {
      isFounderApproved: false,
    });
    expect(refundSafety.allowed).toBe(false);
    expect(refundSafety.requiresHitl).toBe(true);
    expect(refundSafety.reason).toContain('high-impact operation requiring explicit founder HITL approval');

    // With founder approval, it is allowed
    const approvedRefund = validateActionExecutionSafety('issue_subscription_refund', {
      isFounderApproved: true,
    });
    expect(approvedRefund.allowed).toBe(true);
  });

  it('enforces financial safety threshold (> $500 requires founder approval)', () => {
    const largeFinancialCheck = validateActionExecutionSafety('custom_payment_action', {
      payload: { amountDollars: 1200 },
      isFounderApproved: false,
    });
    expect(largeFinancialCheck.allowed).toBe(false);
    expect(largeFinancialCheck.reason).toContain('$500 threshold');
  });

  it('creates and resolves HITL action requests with proper state transitions', () => {
    const action = createHitlAction({
      category: 'billing_revops',
      title: 'Issue 50% Courtesy Refund',
      description: 'Contractor requested refund due to duplicate charge',
      actionType: 'issue_subscription_refund',
      payload: { accountId: 'acc-123', amountCents: 4900 },
      expiresInHours: 48,
    });

    expect(action.status).toBe('pending');
    expect(listPendingHitlActions().length).toBe(1);

    const resolveRes = resolveHitlAction(action.id, 'approved', 'founder-brett', 'Approved per ticket #402');
    expect(resolveRes.success).toBe(true);
    expect(resolveRes.action?.status).toBe('approved');
    expect(resolveRes.action?.resolvedBy).toBe('founder-brett');

    // Should no longer be in pending list
    expect(listPendingHitlActions().length).toBe(0);
  });

  it('handles action expiration correctly when past expiresInHours', () => {
    const now = new Date('2026-08-31T12:00:00Z');
    const pastTime = new Date('2026-09-05T12:00:00Z');

    const action = createHitlAction({
      category: 'customer_support',
      title: 'Temporary Support Impersonation',
      description: '1-hour debug session',
      actionType: 'support_impersonate',
      payload: { accountId: 'acc-600' },
      expiresInHours: 2,
    });

    expect(isHitlActionExpired(action, now)).toBe(false);
    expect(isHitlActionExpired(action, pastTime)).toBe(true);

    // Expired item transitions out of pending list
    const pendingAtPastTime = listPendingHitlActions(pastTime);
    expect(pendingAtPastTime.length).toBe(0);

    const resolveExpired = resolveHitlAction(action.id, 'approved', 'founder-brett', undefined, pastTime);
    expect(resolveExpired.success).toBe(false);
    expect(resolveExpired.error).toContain('expired');
  });
});

describe('RevOps & Lifecycle Growth Engine', () => {
  const mockSupabase = createMockSupabase();

  beforeEach(() => {
    clearOperatorMemory();
  });

  it('runs RevOps scan and produces structured metrics', async () => {
    const scan = await runRevOpsGrowthScan(mockSupabase, { autoDispatchNudges: true });
    expect(scan.scannedAt).toBeDefined();
    expect(scan.details).toBeDefined();
    expect(scan.dunningAccountsIdentified).toBeDefined();
    expect(scan.onboardingNudgesQueued).toBeDefined();
  });
});

describe('Autonomous Cycle & Operator Execution Engine', () => {
  const mockSupabase = createMockSupabase();
  const ctx: OperatorExecutionContext = {
    supabase: mockSupabase,
    adminUserId: 'admin-usr-1',
    source: 'admin_dashboard',
  };

  beforeEach(() => {
    clearOperatorMemory();
  });

  it('executes diagnose_contractor_onboarding tool via executeOperatorTool', async () => {
    const res = await executeOperatorTool('diagnose_contractor_onboarding', { accountId: 'acc-test-123' }, ctx);
    expect(res.data).toBeDefined();
    expect((res.data as any).accountId).toBe('acc-test-123');
    expect((res.data as any).blockerDetails).toBeDefined();
  });

  it('executes triage_support_case tool via executeOperatorTool', async () => {
    const res = await executeOperatorTool(
      'triage_support_case',
      { caseId: 'case-99', subject: 'Payout deposit schedule question' },
      ctx,
    );
    expect(res.data).toBeDefined();
    expect((res.data as any).identifiedTopic).toBe('stripe_payouts');
  });

  it('executes autonomous cycle combining RevOps scan, briefing, and HITL collection', async () => {
    const cycle = await runAutonomousOperatorCycle(mockSupabase);
    expect(cycle.cycleId).toBeDefined();
    expect(cycle.briefing).toBeDefined();
    expect(cycle.briefing.kpiTiles).toBeDefined();
    expect(cycle.briefing.kpiTiles?.length).toBe(6);
    expect(cycle.revOpsScan).toBeDefined();
    expect(cycle.pendingHitlActions).toBeDefined();
    expect(cycle.auditLogs).toBeDefined();
  });

  it('answers founder natural language queries via askAiOperator fallback', async () => {
    const res = await askAiOperator('What is our billing and dunning status?', ctx);
    expect(res.answer).toBeDefined();
    expect(res.toolCallsExecuted).toContain('get_revenue_and_billing_summary');
  });

  it('executes replay_failed_webhooks in both diagnose and replay_and_resolve modes', async () => {
    const diagRes = await executeOperatorTool('replay_failed_webhooks', { action: 'diagnose' }, ctx);
    expect(diagRes.data).toBeDefined();
    expect((diagRes.data as any).success).toBe(true);

    const resolveRes = await executeOperatorTool('replay_failed_webhooks', { action: 'replay_and_resolve' }, ctx);
    expect(resolveRes.data).toBeDefined();
    expect((resolveRes.data as any).success).toBe(true);
  });

  it('enforces RBAC on replay_failed_webhooks: denies unauthorized staff without ops.manage', async () => {
    const supportCtx: OperatorExecutionContext = {
      ...ctx,
      staff: { role: 'support', active: true, id: 'st-support', email: 'support@test.com' },
    };

    const deniedRes = await executeOperatorTool('replay_failed_webhooks', { action: 'replay_and_resolve' }, supportCtx);
    expect((deniedRes.data as any).success).toBe(false);
    expect((deniedRes.data as any).error).toContain('Forbidden');
    expect((deniedRes.data as any).error).toContain('ops.manage');

    const opsCtx: OperatorExecutionContext = {
      ...ctx,
      staff: { role: 'ops', active: true, id: 'st-ops', email: 'ops@test.com' },
    };

    const allowedRes = await executeOperatorTool('replay_failed_webhooks', { action: 'replay_and_resolve' }, opsCtx);
    expect((allowedRes.data as any).success).toBe(true);
  });

  it('executes triage_email_deliverability and categorizes bounce events', async () => {
    const res = await executeOperatorTool('triage_email_deliverability', { limit: 10 }, ctx);
    expect(res.data).toBeDefined();
    expect((res.data as any).totalBounced).toBeDefined();
  });

  it('executes check_sms_carrier_health and evaluates deliverability rate', async () => {
    const res = await executeOperatorTool('check_sms_carrier_health', {}, ctx);
    expect(res.data).toBeDefined();
    expect((res.data as any).carrierDeliverabilityPct).toBeDefined();
    expect((res.data as any).tenDlcStatus).toBe('approved');
  });

  it('executes detect_cron_lateness and flags delayed scheduled tasks', async () => {
    const res = await executeOperatorTool('detect_cron_lateness', {}, ctx);
    expect(res.data).toBeDefined();
    expect((res.data as any).healthy).toBeDefined();
  });

  it('executes scan_plan_upgrade_candidates and estimates ARR expansion', async () => {
    const res = await executeOperatorTool('scan_plan_upgrade_candidates', { thresholdQuotes: 5 }, ctx);
    expect(res.data).toBeDefined();
    expect((res.data as any).qualifiedCandidatesCount).toBeDefined();
  });

  it('executes optimize_dunning_retries and calculates optimal retry windows', async () => {
    const res = await executeOperatorTool('optimize_dunning_retries', {}, ctx);
    expect(res.data).toBeDefined();
    expect((res.data as any).dunningCount).toBeDefined();
  });

  it('executes check_connect_payout_compliance for paused Stripe Connect accounts', async () => {
    const res = await executeOperatorTool('check_connect_payout_compliance', {}, ctx);
    expect(res.data).toBeDefined();
    expect((res.data as any).pausedPayoutsCount).toBeDefined();
  });

  it('executes generate_dispute_evidence_packet with complete timeline defense', async () => {
    const res = await executeOperatorTool('generate_dispute_evidence_packet', { disputeId: 'dp_123' }, ctx);
    expect(res.data).toBeDefined();
    expect((res.data as any).timeline.length).toBeGreaterThan(0);
    expect((res.data as any).readyForSubmission).toBe(true);
  });

  it('executes get_ops_trend_history across multi-day snapshot series', async () => {
    const res = await executeOperatorTool('get_ops_trend_history', { days: 7 }, ctx);
    expect(res.data).toBeDefined();
    expect((res.data as any).history.length).toBe(7);
  });

  it('validates SQL safety: permits read-only queries and rejects multi-statement/mutating constructs', () => {
    expect(isSafeReadOnlySqlQuery('SELECT id, business_name FROM accounts WHERE plan = "solo"')).toBe(true);
    expect(isSafeReadOnlySqlQuery('WITH active_subs AS (SELECT * FROM billing_subscriptions) SELECT count(*) FROM active_subs;')).toBe(true);

    // Multi-statement injection attempt
    expect(isSafeReadOnlySqlQuery('SELECT 1; DROP TABLE accounts;')).toBe(false);
    expect(isSafeReadOnlySqlQuery('SELECT 1; DO $$ BEGIN NULL; END $$;')).toBe(false);

    // Mutation keywords
    expect(isSafeReadOnlySqlQuery('UPDATE accounts SET plan = "scale"')).toBe(false);
    expect(isSafeReadOnlySqlQuery('DELETE FROM webhook_failures WHERE id = "123"')).toBe(false);
    expect(isSafeReadOnlySqlQuery('INSERT INTO staff (email) VALUES ("attacker@test.com")')).toBe(false);

    // Dangerous functions
    expect(isSafeReadOnlySqlQuery('SELECT pg_sleep(10)')).toBe(false);
  });
});
