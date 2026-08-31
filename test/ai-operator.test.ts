import { describe, expect, it, beforeEach } from 'vitest';
import { OPERATOR_TOOLS_DECLARATION, executeOperatorTool } from '@/lib/ai-operator/tools';
import {
  recordOperatorAudit,
  getOperatorAuditLogs,
  createHitlAction,
  listPendingHitlActions,
  resolveHitlAction,
  clearOperatorMemory,
} from '@/lib/ai-operator/audit';
import { diagnoseContractorOnboarding, triageSupportCase } from '@/lib/ai-operator/support-copilot';
import { runRevOpsGrowthScan } from '@/lib/ai-operator/revops-growth';
import { generateExecutiveBriefing } from '@/lib/ai-operator/briefing';
import { runAutonomousOperatorCycle, askAiOperator } from '@/lib/ai-operator/engine';
import type { OperatorExecutionContext } from '@/lib/ai-operator/types';

// Mock Supabase client for unit tests
function createMockSupabase(): any {
  return {
    from: (table: string) => {
      const builder: any = {
        select: (_cols?: string, options?: any) => {
          if (options?.count === 'exact') {
            return {
              eq: (_col: string, _val: any) => ({
                eq: (_col2: string, _val2: any) => Promise.resolve({ count: 2, data: [] }),
                maybeSingle: () => Promise.resolve({ data: null }),
                limit: () => Promise.resolve({ data: [] }),
              }),
            };
          }
          return builder;
        },
        eq: (_col: string, _val: any) => builder,
        limit: (_n: number) => builder,
        order: (_col: string) => builder,
        maybeSingle: () => {
          if (table === 'accounts') {
            return Promise.resolve({
              data: {
                id: 'acc-test-123',
                name: 'Apex Roofing LLC',
                business_name: 'Apex Roofing Pro',
                plan_tier: 'crew',
                status: 'active',
                created_at: '2026-08-01T00:00:00Z',
              },
            });
          }
          return Promise.resolve({ data: null });
        },
        then: (fn: any) => fn({ data: [], error: null }),
      };
      return builder;
    },
  };
}

describe('AI Operator Framework - Tools & Schemas', () => {
  it('registers all required operational tool declarations', () => {
    const names = OPERATOR_TOOLS_DECLARATION.map((t) => t.name);
    expect(names).toContain('get_system_health');
    expect(names).toContain('get_sms_queue_diagnostics');
    expect(names).toContain('get_revenue_and_billing_summary');
    expect(names).toContain('get_contractor_account_360');
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

describe('AI Operator Audit Trail & HITL Queue', () => {
  beforeEach(() => {
    clearOperatorMemory();
  });

  it('records audit log entries and filters by category', () => {
    recordOperatorAudit({
      category: 'sre_platform',
      actionName: 'SMS Queue Probe',
      severity: 'safe_auto',
      reasoningSummary: 'Probe passed 100% deliverability',
      status: 'success',
    });

    recordOperatorAudit({
      category: 'billing_revops',
      actionName: 'Dunning Scan',
      severity: 'info',
      reasoningSummary: 'No overdue accounts',
      status: 'success',
    });

    const sreLogs = getOperatorAuditLogs({ category: 'sre_platform' });
    expect(sreLogs.length).toBe(1);
    expect(sreLogs[0].actionName).toBe('SMS Queue Probe');

    const allLogs = getOperatorAuditLogs();
    expect(allLogs.length).toBe(2);
  });

  it('creates and resolves HITL action requests with proper state transitions', () => {
    const action = createHitlAction({
      category: 'billing_revops',
      title: 'Issue 50% Courtesy Refund',
      description: 'Contractor requested refund due to duplicate charge',
      actionType: 'issue_subscription_refund',
      payload: { accountId: 'acc-123', amountCents: 4900 },
    });

    expect(action.status).toBe('pending');
    expect(listPendingHitlActions().length).toBe(1);

    const resolveRes = resolveHitlAction(action.id, 'approved', 'founder-brett', 'Approved per ticket #402');
    expect(resolveRes.success).toBe(true);
    expect(resolveRes.action?.status).toBe('approved');
    expect(resolveRes.action?.resolvedBy).toBe('founder-brett');

    // Should no longer be pending
    expect(listPendingHitlActions().length).toBe(0);
  });
});

describe('AI Operator Tool Execution Handlers', () => {
  const mockSupabase = createMockSupabase();
  const ctx: OperatorExecutionContext = {
    supabase: mockSupabase,
    adminUserId: 'admin-usr-1',
    source: 'admin_dashboard',
  };

  beforeEach(() => {
    clearOperatorMemory();
  });

  it('executes get_system_health', async () => {
    const res = await executeOperatorTool('get_system_health', {}, ctx);
    expect(res.data).toBeDefined();
    expect((res.data as any).status).toBeDefined();
  });

  it('executes get_contractor_account_360', async () => {
    const res = await executeOperatorTool('get_contractor_account_360', { accountId: 'acc-test-123' }, ctx);
    expect(res.data).toBeDefined();
    expect((res.data as any).name).toBe('Apex Roofing Pro');
    expect((res.data as any).planTier).toBe('crew');
  });

  it('executes trigger_contractor_lifecycle_nudge', async () => {
    const res = await executeOperatorTool(
      'trigger_contractor_lifecycle_nudge',
      { accountId: 'acc-test-123', campaignType: 'onboarding_welcome' },
      ctx,
    );
    expect((res.data as any).success).toBe(true);
    expect((res.data as any).campaignType).toBe('onboarding_welcome');
  });
});

describe('Support Copilot & Onboarding Diagnosis', () => {
  const mockSupabase = createMockSupabase();

  it('diagnoses contractor onboarding blockers', async () => {
    const analysis = await diagnoseContractorOnboarding(mockSupabase, 'acc-test-123');
    expect(analysis.accountId).toBe('acc-test-123');
    expect(analysis.accountName).toBe('Apex Roofing Pro');
    expect(analysis.blockers).toBeDefined();
  });

  it('triages support case with intelligent topic routing and replies', async () => {
    const triage = await triageSupportCase(mockSupabase, {
      id: 'case-99',
      subject: 'When do Stripe payouts deposit to my bank?',
      body: 'I collected $2,500 from a customer yesterday.',
    });

    expect(triage.identifiedTopic).toBe('stripe_payouts');
    expect(triage.urgency).toBe('high');
    expect(triage.suggestedCustomerReply).toContain('Stripe payouts');
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
  });
});

describe('Executive Briefing & Autonomous Cycle', () => {
  const mockSupabase = createMockSupabase();

  beforeEach(() => {
    clearOperatorMemory();
  });

  it('generates a clean markdown executive briefing', async () => {
    const briefing = await generateExecutiveBriefing(mockSupabase);
    expect(briefing.headline).toBeDefined();
    expect(briefing.markdownSummary).toContain('Founder Morning Briefing');
    expect(briefing.operations).toBeDefined();
  });

  it('runs a complete autonomous cycle', async () => {
    const cycle = await runAutonomousOperatorCycle(mockSupabase);
    expect(cycle.cycleId).toBeDefined();
    expect(cycle.briefing).toBeDefined();
    expect(cycle.revOpsScan).toBeDefined();
  });

  it('answers founder natural language queries with askAiOperator fallback', async () => {
    const ctx: OperatorExecutionContext = {
      supabase: mockSupabase,
      source: 'founder_cli',
    };

    const res = await askAiOperator('How is system health?', ctx);
    expect(res.answer).toBeDefined();
    expect(res.toolCallsExecuted).toContain('get_system_health');
  });
});
