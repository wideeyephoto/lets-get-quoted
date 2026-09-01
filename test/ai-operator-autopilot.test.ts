import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processInboundSupportTicket } from '@/lib/ai-operator/support-auto-responder';
import { runWebhookAutoHealer } from '@/lib/ai-operator/webhook-healer';
import { runActivationAutopilotSweep } from '@/lib/ai-operator/activation-nudge';
import { calculateOptimalRetryTimestamp, runSmartDunningSweep } from '@/lib/ai-operator/smart-dunning';
import { runDatabasePoolGuard } from '@/lib/ai-operator/db-guard';
import {
  generateApprovalToken,
  verifyApprovalToken,
  formatInteractiveApprovalPayload,
  processMobileApprovalCallback,
} from '@/lib/ai-operator/approval-bridge';

function createChainableSupabase(resolvedData: any = []) {
  const queryBuilder: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockImplementation(() => Promise.resolve({ data: null, error: null })),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: resolvedData, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: resolvedData?.[0] ?? resolvedData ?? null, error: null }),
    single: vi.fn().mockResolvedValue({ data: resolvedData?.[0] ?? resolvedData ?? null, error: null }),
    then: (onFulfilled: any, onRejected?: any) => Promise.resolve({ data: resolvedData, error: null }).then(onFulfilled, onRejected),
    catch: (onRejected: any) => Promise.resolve({ data: resolvedData, error: null }).catch(onRejected),
  };

  return {
    from: vi.fn().mockReturnValue(queryBuilder),
    rpc: vi.fn().mockResolvedValue({ data: resolvedData, error: null }),
  } as any;
}

describe('AI Operator Autopilot Engines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Support Ticket Auto-Responder & Deflection', () => {
    it('auto-resolves high-confidence safe inquiries with instant replies', async () => {
      const mockSupabase = createChainableSupabase([]);

      const ticket = {
        id: 'case-stripe-1',
        account_id: 'acc-1',
        customer_email: 'contractor@example.com',
        subject: 'How do I connect my Stripe bank account for payouts?',
        body: 'I need help setting up bank identity verification so my clients can pay deposits online.',
      };

      const result = await processInboundSupportTicket(mockSupabase, ticket, { dryRun: true });
      expect(result.autoResolved).toBe(true);
      expect(result.confidenceScore).toBeGreaterThanOrEqual(85);
      expect(result.topic).toBe('stripe_connect_onboarding');
      expect(result.replyText).toContain('Stripe Connect');
    });

    it('forces human review on low-confidence or legal/dispute keywords', async () => {
      const mockSupabase = createChainableSupabase([]);

      const ticket = {
        id: 'case-dispute-1',
        account_id: 'acc-1',
        customer_email: 'angry@example.com',
        subject: 'I am filing a chargeback and contacting my lawyer for fraud',
        body: 'You overcharged my credit card, this is a scam!',
      };

      const result = await processInboundSupportTicket(mockSupabase, ticket, { dryRun: true });
      expect(result.autoResolved).toBe(false);
      expect(result.confidenceScore).toBeLessThan(50);
    });
  });

  describe('2. Webhook Self-Healing & Dead-Letter Replay', () => {
    it('correctly processes and auto-resolves transient webhook drops', async () => {
      const mockSupabase = createChainableSupabase([
        {
          id: 'wh-1',
          source: 'stripe',
          event_type: 'payment_intent.succeeded',
          error_message: 'HTTP 504 Gateway Timeout',
        },
      ]);

      const report = await runWebhookAutoHealer(mockSupabase, { dryRun: false });
      expect(report.totalUnresolved).toBe(1);
      expect(report.replayedCount).toBe(1);
      expect(report.autoResolvedCount).toBe(1);
      expect(report.escalatedToHitlCount).toBe(0);
    });
  });

  describe('3. Proactive Contractor Activation Nudges', () => {
    it('scans accounts and evaluates milestone prompts with TCPA quiet-hours protection', async () => {
      const mockSupabase = createChainableSupabase([
        {
          id: 'acc-new-1',
          business_name: 'Apex Roofing',
          email: 'apex@roof.com',
          created_at: new Date(Date.now() - 60 * 60 * 60 * 1000).toISOString(), // 60h ago (>48h)
          timezone: 'America/New_York',
        },
      ]);

      const report = await runActivationAutopilotSweep(mockSupabase, { dryRun: true });
      expect(report.accountsScanned).toBe(1);
      // Either milestone nudge was queued or quiet hours protection safely deferred dispatch
      expect(report.welcomeNudgesSent + report.stripeRemindersSent + report.skippedQuietHours).toBeGreaterThanOrEqual(1);
    });
  });

  describe('4. Smart RevOps Dunning & Decline-Aware Logic', () => {
    it('calculates optimal retry timing based on decline reasons', () => {
      const base = new Date('2026-09-01T12:00:00Z'); // Tuesday

      const payrollRetry = calculateOptimalRetryTimestamp('insufficient_funds', base);
      expect(payrollRetry.strategy).toBe('payroll_cycle_alignment');

      const transientRetry = calculateOptimalRetryTimestamp('processing_error', base);
      expect(transientRetry.strategy).toBe('transient_network_backoff');

      const expiredRetry = calculateOptimalRetryTimestamp('expired_card', base);
      expect(expiredRetry.strategy).toBe('immediate_card_update_required');
    });
  });

  describe('5. Database Connection Pool Guard', () => {
    it('runs database pool inspection and reports status', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as any;

      const report = await runDatabasePoolGuard(mockSupabase, { dryRun: true });
      expect(report.status).toBe('healthy');
      expect(report.longRunningQueriesCount).toBe(0);
      expect(report.canceledQueriesCount).toBe(0);
    });
  });

  describe('6. Telegram / Slack Mobile 1-Click Approval Bridge', () => {
    const testSecret = 'unit-test-crypto-secret-key-12345';
    const actionId = 'act-payout-approve-99';

    it('generates cryptographically valid HMAC approval tokens', () => {
      const expiresAt = Date.now() + 60000;
      const token = generateApprovalToken(actionId, 'approved', expiresAt, testSecret);
      expect(token).toBeDefined();
      expect(token.length).toBe(64); // SHA-256 hex string

      const isValid = verifyApprovalToken(actionId, 'approved', expiresAt, token, testSecret);
      expect(isValid).toBe(true);
    });

    it('rejects tampered or expired approval tokens', () => {
      const expiresAt = Date.now() + 60000;
      const token = generateApprovalToken(actionId, 'approved', expiresAt, testSecret);

      // Tampered decision
      const isRejectedValid = verifyApprovalToken(actionId, 'rejected', expiresAt, token, testSecret);
      expect(isRejectedValid).toBe(false);

      // Expired timestamp
      const isExpiredValid = verifyApprovalToken(actionId, 'approved', Date.now() - 1000, token, testSecret);
      expect(isExpiredValid).toBe(false);
    });

    it('formats Slack Block Kit and Telegram payloads with action URLs', () => {
      const action = {
        id: 'act-101',
        category: 'sre_platform' as const,
        title: 'Re-verify Custom Domain SSL',
        description: 'Auto-retry SSL handshake for contractor domain',
        actionType: 'sre.ssl_retry',
        payload: { domain: 'www.test.com' },
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
      };

      const { approveUrl, rejectUrl, slackPayload, telegramText } = formatInteractiveApprovalPayload(action);
      expect(approveUrl).toContain('decision=approved');
      expect(rejectUrl).toContain('decision=rejected');
      expect(slackPayload.blocks.length).toBe(3);
      expect(telegramText).toContain('AI Operator Approval Request');
    });
  });
});
