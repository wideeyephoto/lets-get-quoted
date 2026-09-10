import { describe, expect, it, beforeEach } from 'vitest';
import { OPERATOR_TOOLS_DECLARATION, executeOperatorTool } from '@/lib/ai-operator/tools';
import {
  recordOperatorAudit,
  getOperatorAuditLogs,
  createHitlAction,
  getHitlActionById,
  listPendingHitlActions,
  resolveHitlAction,
  clearOperatorMemory,
  isHitlActionExpired,
  isActionSafeForAutoRemediation,
  validateActionExecutionSafety,
  permissionForHitlAction,
  SAFE_AUTO_REMEDIATION_ACTION_TYPES,
  REQUIRES_APPROVAL_ACTION_TYPES,
  flushOperatorWrites,
} from '@/lib/ai-operator/audit';
import {
  diagnoseContractorOnboarding,
  triageSupportCase,
} from '@/lib/ai-operator/support-copilot';
import { runRevOpsGrowthScan } from '@/lib/ai-operator/revops';
import { generateExecutiveBriefing, calculateSmsDeliverability } from '@/lib/ai-operator/briefing';
import { getZeroQuoteActivationCandidates, isSyntheticAccountName } from '@/lib/admin-alerts';
import {
  runAutonomousOperatorCycle,
  askAiOperator,
  executeHitlDecision,
} from '@/lib/ai-operator/engine';
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
  accountsWithPlan?: Array<{ plan: string }>;
  workspaceEntitlements?: any;
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
                  (resPromise as any).eq = () => resPromise;
                  (resPromise as any).gt = () => resPromise;
                  (resPromise as any).in = () => resPromise;
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
          if (table === 'workspace_entitlements' && col === 'account_id') {
            return {
              maybeSingle: () =>
                Promise.resolve({
                  data: overrides?.workspaceEntitlements !== undefined ? overrides.workspaceEntitlements : null,
                }),
            };
          }
          if (table === 'accounts' && col === 'id') {
            return {
              maybeSingle: () =>
                Promise.resolve({
                  data:
                    overrides?.accountRow !== undefined
                      ? (overrides.accountRow ? { id: val, ...overrides.accountRow } : null)
                      : {
                          id: val,
                          business_name: 'Apex Roofing Pro',
                          plan: 'crew_plus',
                          subscription_status: 'active',
                          suspended_at: null,
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
          if (table === 'accounts' && col === 'plan') {
            return Promise.resolve({
              data:
                overrides?.accountsWithPlan !== undefined
                  ? overrides.accountsWithPlan
                  : [
                      { plan: 'solo' },
                      { plan: 'growth' },
                      { plan: 'scale' },
                    ],
              error: null,
            });
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
    expect(names).toContain('list_pending_action_requests');
    expect(names).toContain('trigger_contractor_lifecycle_nudge');
  });

  // The operator proposes action cards; only the founder resolves them. Exposing the
  // resolver let the model clear its own approvals, skipping the per-action permission
  // and the MFA step-up that resolveHitlActionServerAction enforces -- and stamping the
  // signed-in admin as the approver. This operator also reads untrusted support ticket
  // text, so an injected instruction had a route to dismissing approvals in their name.
  it('never offers the approval resolver to the model', () => {
    const names = OPERATOR_TOOLS_DECLARATION.map((t) => t.name);
    expect(names).not.toContain('resolve_hitl_action');
  });

  it('refuses to resolve an approval even when called directly', async () => {
    const ctx: OperatorExecutionContext = {
      supabase: createMockSupabase(),
      adminUserId: 'admin-usr-1',
      source: 'admin_dashboard',
    };
    const created = createHitlAction({
      category: 'billing_revops',
      title: 'Refund a subscription',
      description: 'Needs founder sign-off',
      actionType: 'issue_subscription_refund',
      payload: { accountId: 'acc-1', amountDollars: 120 },
      isFinancialMutation: true,
      requiredRole: 'founder',
    });

    const res = await executeOperatorTool(
      'resolve_hitl_action',
      { actionId: created.id, decision: 'approved' },
      ctx,
    );

    expect((res.data as any).error).toContain('Unknown operator tool');
    // The card must still be waiting for a human.
    expect(getHitlActionById(created.id)?.status).toBe('pending');
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

  it('correctly maps get_contractor_account_360 using real accounts columns without phantom fields', async () => {
    const mockSupabase = createMockSupabase({
      accountRow: {
        business_name: 'Acme Heating & Cooling',
        plan: 'crew_plus',
        subscription_status: 'active',
        suspended_at: null,
        created_at: '2026-08-01T00:00:00Z',
      },
    });

    const ctx: OperatorExecutionContext = {
      supabase: mockSupabase,
      source: 'admin_dashboard',
      adminUserId: 'admin-usr-1',
    };

    const res = await executeOperatorTool('get_contractor_account_360', { accountId: 'acc_123' }, ctx);
    expect(res.data).toBeDefined();
    expect((res.data as any).name).toBe('Acme Heating & Cooling');
    expect((res.data as any).status).toBe('active');
    expect((res.data as any).planTier).toBe('crew_plus');
  });

  it('correctly reports suspended status when account has suspended_at set', async () => {
    const mockSupabase = createMockSupabase({
      accountRow: {
        business_name: 'Suspended Contractor',
        plan: 'pro',
        subscription_status: 'active',
        suspended_at: '2026-09-01T12:00:00Z',
        created_at: '2026-08-01T00:00:00Z',
      },
    });

    const ctx: OperatorExecutionContext = {
      supabase: mockSupabase,
      source: 'admin_dashboard',
      adminUserId: 'admin-usr-1',
    };

    const res = await executeOperatorTool('get_contractor_account_360', { accountId: 'acc_susp' }, ctx);
    expect((res.data as any).status).toBe('suspended');
    expect((res.data as any).planTier).toBe('pro');
  });

  it('prefers canonical workspace_entitlements plan and billing_status when available', async () => {
    const mockSupabase = createMockSupabase({
      accountRow: {
        business_name: 'Entitled Contractor',
        plan: 'free',
        subscription_status: null,
        suspended_at: null,
      },
      workspaceEntitlements: {
        plan_code: 'scale',
        billing_status: 'active',
        entitlement_state: 'active',
      },
    });

    const ctx: OperatorExecutionContext = {
      supabase: mockSupabase,
      source: 'admin_dashboard',
      adminUserId: 'admin-usr-1',
    };

    const res = await executeOperatorTool('get_contractor_account_360', { accountId: 'acc_ent' }, ctx);
    expect((res.data as any).planTier).toBe('scale');
    expect((res.data as any).status).toBe('active');
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

  it('calculates MRR fallback 3 correctly from accounts.plan when subscription tables are empty', async () => {
    const mockSupabase = createMockSupabase({
      subscriptions: [],
      accountsWithPlan: [
        { plan: 'solo' },
        { plan: 'growth' },
        { plan: 'crew_plus' },
      ],
      accountsCount: 10,
      newAccountsCount: 2,
      onboardedCount: 3,
    });

    const briefing = await generateExecutiveBriefing(mockSupabase, { periodLabel: 'Last 24 Hours' });
    // solo ($39) + growth ($129) + crew_plus/scale ($329) = $497
    expect(briefing.revenue.mrrEstimated).toBe(497);
    expect(briefing.revenue.activeSubscriptions).toBe(3);
    expect(briefing.revenue.paidPlanCounts.solo).toBe(1);
    expect(briefing.revenue.paidPlanCounts.growth).toBe(1);
    expect(briefing.revenue.paidPlanCounts.scale).toBe(1);
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
      createdAt: now,
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
    expect(scan.onboardingNudgeCandidates).toBeDefined();
  });

  // A production run of this cron wrote four audit rows reading "Automated Onboarding
  // Nudge Dispatched" at safe_auto/success, and answered "4 safe actions executed".
  // No email or SMS call exists on this path. Identification is not outreach, and the
  // audit trail is the record the founder trusts.
  it('never records an unsent nudge as a dispatch', async () => {
    clearOperatorMemory();
    await runRevOpsGrowthScan(mockSupabase, { autoDispatchNudges: true });

    const logs = getOperatorAuditLogs({ limit: 50 });
    for (const entry of logs) {
      expect(entry.actionName).not.toMatch(/dispatch/i);
      expect(entry.reasoningSummary ?? '').not.toMatch(/dispatched/i);
    }
    // Identification is real work and stays in the trail -- it just cannot claim a send.
    const candidates = logs.filter((l) => l.actionName === 'Onboarding Nudge Candidate Identified');
    for (const c of candidates) expect(c.severity).not.toBe('safe_auto');
  });

  it('reports zero safe actions executed while nothing can send', async () => {
    const report = await runAutonomousOperatorCycle(mockSupabase);
    expect(report.auditActionsLogged).toBe(0);
    expect(report.safeActionsExecuted).toBe(0);
    expect(typeof report.onboardingNudgeCandidates).toBe('number');
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
    expect((resolveRes.data as any).success).toBe(false);
    expect(resolveRes.data).toMatchObject({ replayedCount: 0, resolvedCount: 0 });
    expect((resolveRes.data as any).error).toContain('Generic webhook replay is unavailable');
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
    expect((allowedRes.data as any).success).toBe(false);
    expect((allowedRes.data as any).error).toContain('Generic webhook replay is unavailable');
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

  it('refuses optimize_dunning_retries honestly until delivery rails exist (P2-1)', async () => {
    const res = await executeOperatorTool('optimize_dunning_retries', {}, ctx);
    expect(res.data).toBeDefined();
    expect((res.data as any).available).toBe(false);
    expect((res.data as any).error).toContain('billing-operations');
  });

  it('executes check_connect_payout_compliance for paused Stripe Connect accounts', async () => {
    const res = await executeOperatorTool('check_connect_payout_compliance', {}, ctx);
    expect(res.data).toBeDefined();
    expect((res.data as any).pausedPayoutsCount).toBeDefined();
  });

  // This tool used to ignore disputeId and return a fixed $250 packet for
  // "acc-contractor-sample" with five invented events, flagged readyForSubmission.
  // The old test asserted exactly that, so it held the fabrication in place. Evidence
  // filed with a card network has to come from real rows or not exist at all.
  it('refuses to assemble a dispute evidence packet from data it does not have', async () => {
    const res = await executeOperatorTool('generate_dispute_evidence_packet', { disputeId: 'dp_123' }, ctx);
    const data = res.data as { available: boolean; timeline?: unknown; error: string };

    expect(data.available).toBe(false);
    expect(data.timeline).toBeUndefined();
    expect(data.error).toMatch(/not yet wired/i);
    // Never claim a packet is submittable.
    expect((data as { readyForSubmission?: boolean }).readyForSubmission).toBeUndefined();
  });

  // The series was synthesised as `168 + i * 15` and presented as real trend history.
  // Nothing records a daily metrics snapshot, so there is no history to report.
  it('reports that trend history is unavailable rather than synthesising a series', async () => {
    const res = await executeOperatorTool('get_ops_trend_history', { days: 7 }, ctx);
    const data = res.data as { available: boolean; history: unknown[]; error: string };

    expect(data.available).toBe(false);
    expect(data.history).toEqual([]);
    expect(data.error).toMatch(/no historical metrics/i);
  });

  // It logged "dispatched" and returned a timestamp while no sender was ever called.
  it('does not report a lifecycle nudge as sent when nothing sends it', async () => {
    const res = await executeOperatorTool(
      'trigger_contractor_lifecycle_nudge',
      { accountId: 'acc-1', campaignType: 'onboarding_welcome' },
      ctx,
    );
    const data = res.data as { success: boolean; dispatchedAt?: string; error?: string };

    expect(data.success).toBe(false);
    expect(data.dispatchedAt).toBeUndefined();
    expect(data.error).toMatch(/no sender/i);
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

  it('correctly maps operator actions to explicit staff permissions preventing privilege escalation', () => {
    expect(permissionForHitlAction('issue_subscription_refund')).toBe('money.refund');
    expect(permissionForHitlAction('modify_account_tier')).toBe('money.plan');
    expect(permissionForHitlAction('waive_platform_fee')).toBe('money.plan');
    expect(permissionForHitlAction('extend_contractor_trial')).toBe('money.plan');
    expect(permissionForHitlAction('suspend_account_access')).toBe('account.enforce');
    expect(permissionForHitlAction('force_payout_settlement')).toBe('money.payouts');
    expect(permissionForHitlAction('trigger_dunning_escalation')).toBe('money.payouts');
    expect(permissionForHitlAction('trigger_contractor_lifecycle_nudge')).toBe('account.support');
    expect(permissionForHitlAction('replay_failed_webhooks')).toBe('ops.manage');
    expect(permissionForHitlAction('execute_database_mutation')).toBe('ops.manage');
  });

  it('executes approved HITL actions and records execution result', async () => {
    const action = createHitlAction({
      category: 'growth_lifecycle',
      title: 'Send Onboarding Nudge to Stalled Lead',
      description: 'Contractor stalled after connecting bank',
      actionType: 'trigger_contractor_lifecycle_nudge',
      payload: { accountId: 'acc-test-999', campaignType: 'onboarding_welcome' },
    });

    const approvedResult = await executeHitlDecision(
      action.id,
      'approved',
      'staff@letsgetquoted.com',
      'Approved following customer request',
      ctx,
    );

    expect(approvedResult.success).toBe(true);
    expect(approvedResult.action?.status).toBe('approved');
    expect(approvedResult.action?.resolvedBy).toBe('staff@letsgetquoted.com');
    expect(approvedResult.executionResult).toBeDefined();

    // Resolving the card and performing the work are two different outcomes. This
    // assertion used to read `.success === true` for a nudge that no sender has ever
    // delivered, which made an approval look like an outreach. The decision lands;
    // the dispatch reports that it cannot happen yet.
    expect((approvedResult.executionResult as { success: boolean }).success).toBe(false);
    expect((approvedResult.executionResult as { error: string }).error).toMatch(/no sender/i);
  });
});

// A percentage without a denominator is not a rate. The briefing used to report a
// hardcoded 98.5% whenever anything failed, and a tile computed as
// `100 - failures * 0.5`, so the number moved with the failure count but never
// described delivery. These lock the arithmetic to real counts.
describe('SMS deliverability is measured, not asserted', () => {
  function smsMock(total: number, failed: number): any {
    return {
      from: (table: string) => ({
        select: (_cols?: string, options?: any) => {
          if (table !== 'sms_events' || options?.count !== 'exact') {
            throw new Error(`unexpected read: ${table}`);
          }
          let failedOnly = false;
          const builder: any = {
            is: () => builder,
            gte: () => Promise.resolve({ count: failedOnly ? failed : total, error: null }),
            eq: (col: string, val: any) => {
              if (col === 'status' && val === 'failed') failedOnly = true;
              return builder;
            },
          };
          return builder;
        },
      }),
    };
  }

  it('divides failures by real send volume', async () => {
    const res = await calculateSmsDeliverability(smsMock(200, 3));
    expect(res.totalSends).toBe(200);
    expect(res.failedSends).toBe(3);
    expect(res.deliverabilityPct).toBe(98.5);
  });

  it('does not claim 100% when nothing was sent', async () => {
    const res = await calculateSmsDeliverability(smsMock(0, 0));
    expect(res.totalSends).toBe(0);
    // null, not 100 -- an empty window has no rate to report.
    expect(res.deliverabilityPct).toBeNull();
  });

  it('reports the same failure count at different volumes as different rates', async () => {
    const quiet = await calculateSmsDeliverability(smsMock(10, 5));
    const busy = await calculateSmsDeliverability(smsMock(1000, 5));
    expect(quiet.deliverabilityPct).toBe(50);
    expect(busy.deliverabilityPct).toBe(99.5);
  });
});

// Persistence is issued from synchronous call sites, so inserts cannot be awaited
// inline. On serverless the runtime freezes when the response is sent, which drops
// anything still in flight -- the audit trail then vanishes exactly when it matters.
describe('operator writes are awaited before a request returns', () => {
  it('flushes an in-flight audit insert', async () => {
    let landed = false;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const slowClient: any = {
      from: () => ({
        insert: () => gate.then(() => { landed = true; return { error: null }; }),
      }),
    };

    recordOperatorAudit(
      {
        category: 'executive',
        actionName: 'Probe',
        severity: 'info',
        reasoningSummary: 'Persistence flush probe',
        status: 'success',
      },
      slowClient,
    );

    // Returning here is what used to lose the row.
    expect(landed).toBe(false);

    release();
    await flushOperatorWrites();
    expect(landed).toBe(true);
  });

  it('resolves when there is nothing pending', async () => {
    await expect(flushOperatorWrites()).resolves.toBeUndefined();
  });
});

describe('Operator Activation Nudge: Audience Correction, Permissions, and Execution Safety', () => {
  it('maps batch_activation_nudges to account.support permission', () => {
    expect(permissionForHitlAction('batch_activation_nudges')).toBe('account.support');
  });

  it('requires explicit approval for batch_activation_nudges in safety policies', () => {
    expect(REQUIRES_APPROVAL_ACTION_TYPES.has('batch_activation_nudges')).toBe(true);
    expect(isActionSafeForAutoRemediation('batch_activation_nudges')).toBe(false);
  });

  it('deduplicates HITL actions when a deterministic ID is supplied', () => {
    const deterministicId = 'hitl-batch_activation_nudges-2026-09-09';

    const card1 = createHitlAction({
      id: deterministicId,
      category: 'growth_lifecycle',
      title: 'First Quote Activation Nudges',
      description: 'First attempt',
      actionType: 'batch_activation_nudges',
      payload: { count: 1 },
    });

    const card2 = createHitlAction({
      id: deterministicId,
      category: 'growth_lifecycle',
      title: 'First Quote Activation Nudges',
      description: 'Second attempt should return existing card',
      actionType: 'batch_activation_nudges',
      payload: { count: 2 },
    });

    expect(card1.id).toBe(deterministicId);
    expect(card2.id).toBe(deterministicId);
    expect(card2.description).toBe('First attempt'); // unchanged
    expect(listPendingHitlActions().filter((a) => a.id === deterministicId).length).toBe(1);
  });

  it('leaves action pending and returns success: false on unknown actionType or tool failure (Stage 5)', async () => {
    const unknownAction = createHitlAction({
      category: 'growth_lifecycle',
      title: 'Action with nonexistent tool',
      description: 'Will fail at tool resolution',
      actionType: 'totally_unknown_action_type',
      payload: {},
    });

    const mockCtx: OperatorExecutionContext = {
      supabase: createMockSupabase(),
      adminUserId: 'founder@letsgetquoted.com',
      source: 'admin_dashboard',
    };

    const res = await executeHitlDecision(
      unknownAction.id,
      'approved',
      'founder@letsgetquoted.com',
      'Approving unknown tool',
      mockCtx,
    );

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Unknown operator tool/i);
    // Action MUST remain pending, not marked approved
    const stored = getHitlActionById(unknownAction.id);
    expect(stored?.status).toBe('pending');
  });

  it('filters out accounts with quoted jobs > 0 and synthetic fixture accounts', async () => {
    expect(isSyntheticAccountName('Webhook test ea923c32')).toBe(true);
    expect(isSyntheticAccountName('E2E Leads-Jobs 4f691e58')).toBe(true);
    expect(isSyntheticAccountName('Test Contractor')).toBe(true);
    expect(isSyntheticAccountName('Apex Roofing LLC')).toBe(false);
    expect(isSyntheticAccountName('My Business')).toBe(false);

    const mockAccounts = [
      {
        id: 'acc-chelsea',
        business_name: 'Chelsea Landry Renovations',
        account_number: 101,
        created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
        test_marker: null,
      },
      {
        id: 'acc-zero-quote',
        business_name: 'Brand New Painting',
        account_number: 102,
        created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
        test_marker: null,
      },
      {
        id: 'acc-fixture',
        business_name: 'Webhook test ea923c32',
        account_number: 103,
        created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
        test_marker: null,
      },
    ];

    const mockJobsWithQuotes = [
      { account_id: 'acc-chelsea' }, // Has 166 quotes (quoted_amount > 0)
    ];

    const mockAdmin: any = {
      from: (table: string) => {
        const query: any = {
          select: () => query,
          is: () => query,
          order: () => query,
          limit: () => query,
          in: () => query,
          gt: () => query,
          then: (resolve: any) => {
            if (table === 'accounts') {
              return resolve({ data: mockAccounts, error: null });
            }
            if (table === 'jobs') {
              return resolve({ data: mockJobsWithQuotes, error: null });
            }
            return resolve({ data: [], error: null });
          },
        };
        return query;
      },
    };

    const candidates = await getZeroQuoteActivationCandidates(mockAdmin);

    // acc-chelsea must NOT be present (has quoted jobs)
    expect(candidates.some((c) => c.id === 'acc-chelsea')).toBe(false);
    // acc-fixture must NOT be present (synthetic fixture name)
    expect(candidates.some((c) => c.id === 'acc-fixture')).toBe(false);
    // acc-zero-quote MUST be present
    expect(candidates.some((c) => c.id === 'acc-zero-quote')).toBe(true);
    expect(candidates.length).toBe(1);
    expect(candidates[0].quoted_jobs).toBe(0);
  });

  it('approves and executes batch_activation_nudges safely in dry-run mode when flag is off', async () => {
    delete process.env.ACTIVATION_NUDGE_SEND_ENABLED;

    const action = createHitlAction({
      category: 'growth_lifecycle',
      title: 'First-Quote Activation Nudges (1 Contractor)',
      description: 'Testing approval in dry-run mode',
      actionType: 'batch_activation_nudges',
      payload: {
        stepId: 'nudge_zero_quotes',
        channel: 'email',
        recipients: [
          {
            accountId: 'acc-test-dryrun',
            businessName: 'Apex Framing Co',
            email: 'apex@exampledryrun.com',
            ageDays: 12,
            quotedJobs: 0,
          },
        ],
        skipped: [],
      },
    });

    const mockCtx: OperatorExecutionContext = {
      supabase: createMockSupabase({ accountRow: { created_at: new Date(Date.now() - 30 * 86400000).toISOString() } }),
      adminUserId: 'founder@letsgetquoted.com',
      source: 'admin_dashboard',
    };

    const res = await executeHitlDecision(
      action.id,
      'approved',
      'founder@letsgetquoted.com',
      'Approved dry-run activation nudge',
      mockCtx,
    );

    expect(res.success).toBe(true);
    expect(res.action?.status).toBe('approved');
    const exec = res.executionResult as any;
    expect(exec.dryRun).toBe(true);
    expect(exec.sent).toBe(0);
    expect(exec.skipped).toBe(1);
    expect(exec.details[0].note).toContain('no longer eligible');
  });
});
