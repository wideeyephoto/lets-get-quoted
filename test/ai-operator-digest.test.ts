import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ExecutiveBriefing } from '@/lib/ai-operator/types';

// A live run on 2026-09-08 reported `digestDelivered: true` for a message that hard
// bounced two seconds later: the recipient defaulted to founder@letsgetquoted.com,
// which is not a mailbox, and the Resend result was never inspected. There were no
// tests over this file at all, which is why both survived.

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const briefing = {
  generatedAt: new Date().toISOString(),
  period: 'Last 24 Hours',
  headline: 'test',
  kpiTiles: [],
  revenue: { mrrEstimated: 168, activeSubscriptions: 2, paidPlanCounts: { solo: 1, growth: 1, scale: 0 }, dunningCount: 0, dunningTotalAmountCents: 0, pendingPayouts: 0 },
  operations: { smsDeliverabilityPct: 100, smsTotalSends: 9, smsFailedSends: 0, queueHealth: 'healthy', cronStatus: 'ok', cronTroubledCount: 0, unresolvedWebhooksCount: 0, activeIncidentsCount: 0 },
  contractors: { totalActive: 11, onboardedInPeriod: 7, atRiskChurn: 4, unactivatedCount: 4 },
  escalations: { openDisputesCount: 0, casesNearSlaCount: 0, casesWithoutSlaCount: 0, pendingHitlApprovalsCount: 0 },
  actionsTaken: [],
  pendingApprovals: [],
  markdownSummary: '# test',
} as unknown as ExecutiveBriefing;

async function loadDigest() {
  vi.resetModules();
  return import('@/lib/ai-operator/digest');
}

describe('the operator digest reports what actually happened', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    sendMock.mockReset();
    process.env.RESEND_API_KEY = 're_test_key';
    delete process.env.OPERATOR_SLACK_WEBHOOK_URL;
    delete process.env.OPERATOR_DISCORD_WEBHOOK_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('does not invent a recipient when none is configured', async () => {
    delete process.env.ADMIN_ALERT_EMAIL;
    const { dispatchExecutiveBriefingDigest } = await loadDigest();

    const res = await dispatchExecutiveBriefingDigest(briefing);

    // The old default was founder@letsgetquoted.com, which hard bounces. Sending
    // nowhere daily is worse than sending nothing.
    expect(sendMock).not.toHaveBeenCalled();
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/ADMIN_ALERT_EMAIL/);
  });

  it('never addresses the dead founder alias', async () => {
    process.env.ADMIN_ALERT_EMAIL = 'real@example.com';
    sendMock.mockResolvedValue({ data: { id: 'e1' }, error: null });
    const { dispatchExecutiveBriefingDigest } = await loadDigest();

    await dispatchExecutiveBriefingDigest(briefing);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].to).toBe('real@example.com');
    expect(JSON.stringify(sendMock.mock.calls[0][0])).not.toContain('founder@letsgetquoted.com');
  });

  // The defect exactly: the SDK resolves with { error } instead of throwing, so an
  // unchecked await let a provider rejection through as a delivery.
  it('reports failure when the provider rejects the send', async () => {
    process.env.ADMIN_ALERT_EMAIL = 'real@example.com';
    sendMock.mockResolvedValue({ data: null, error: { message: 'domain not verified' } });
    const { dispatchExecutiveBriefingDigest } = await loadDigest();

    const res = await dispatchExecutiveBriefingDigest(briefing);

    expect(res.success).toBe(false);
    expect(res.deliveredVia).toEqual([]);
    expect(res.error).toMatch(/domain not verified/);
  });

  it('does not dress a total failure up as a delivery channel', async () => {
    process.env.ADMIN_ALERT_EMAIL = 'real@example.com';
    sendMock.mockResolvedValue({ data: null, error: { message: 'nope' } });
    const { dispatchExecutiveBriefingDigest } = await loadDigest();

    const res = await dispatchExecutiveBriefingDigest(briefing);

    // It used to substitute ['in-memory-logged'], which reads as a channel.
    expect(res.deliveredVia).not.toContain('in-memory-logged');
    expect(res.deliveredVia).toHaveLength(0);
  });

  it('reports success only when the provider accepted it', async () => {
    process.env.ADMIN_ALERT_EMAIL = 'real@example.com';
    sendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null });
    const { dispatchExecutiveBriefingDigest } = await loadDigest();

    const res = await dispatchExecutiveBriefingDigest(briefing);

    expect(res.success).toBe(true);
    expect(res.deliveredVia).toContain('email:real@example.com');
    expect(res.error).toBeUndefined();
  });

  it('surfaces a thrown send as a failure rather than swallowing it', async () => {
    process.env.ADMIN_ALERT_EMAIL = 'real@example.com';
    sendMock.mockRejectedValue(new Error('network down'));
    const { dispatchExecutiveBriefingDigest } = await loadDigest();

    const res = await dispatchExecutiveBriefingDigest(briefing);

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/network down/);
  });

  it('does not page anyone into the void on a critical alert', async () => {
    delete process.env.ADMIN_ALERT_EMAIL;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { dispatchCriticalAnomalyAlert } = await loadDigest();

    await dispatchCriticalAnomalyAlert({ title: 'DB down', details: 'x', severity: 'critical' });

    expect(sendMock).not.toHaveBeenCalled();
    // If it cannot page, that has to be loud in the logs, not silent.
    expect(errorSpy.mock.calls.flat().join(' ')).toMatch(/NOT SENT/);
    errorSpy.mockRestore();
  });
});
