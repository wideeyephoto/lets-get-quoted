import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { sendOperationalEmergencyAlert } from '../src/lib/founder-alerts';

describe('sendOperationalEmergencyAlert', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('gracefully logs and skips dispatch when RESEND_API_KEY is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendOperationalEmergencyAlert({
      incidentType: 'uptime',
      severity: 'critical',
      title: 'Database connection pool saturated',
      summary: '5xx errors observed across API handlers due to Supabase pooler limit',
    });

    expect(result.dispatched).toBe(false);
    expect(result.recipient).toBe('hello@letsgetquoted.com');
  });

  it('formats and dispatches operational alert across all emergency incident types', async () => {
    process.env.RESEND_API_KEY = 're_test_mock_123';
    process.env.FOUNDER_ALERT_EMAIL = 'founder@letsgetquoted.com';

    for (const incidentType of [
      'uptime',
      'runtime_exception',
      'cron_failure',
      'webhook_dead_letter',
      'billing_reconciliation',
      'sms_queue_stall',
      'provider_outage',
    ] as const) {
      const result = await sendOperationalEmergencyAlert({
        incidentType,
        severity: 'critical',
        title: `Test Drill: ${incidentType}`,
        summary: `Manufactured drill failure for ${incidentType}`,
        affectedAccountsCount: 5,
        actionRequired: 'Acknowledge drill in SRE dashboard',
        details: { simulated: true, errorCount: 42 },
      });

      expect(result.recipient).toBe('founder@letsgetquoted.com');
    }
  });
});
