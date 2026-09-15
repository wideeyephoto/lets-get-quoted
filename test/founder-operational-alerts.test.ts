import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { sendOperationalEmergencyAlert } from '../src/lib/founder-alerts';

const send = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({ Resend: class { emails = { send }; } }));

describe('sendOperationalEmergencyAlert', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    send.mockReset().mockResolvedValue({ data: { id: 'provider-email' }, error: null });
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
      expect(result.dispatched).toBe(true);
      expect(result.providerId).toBe('provider-email');
    }
  });

  it('reports SDK rejection and respects the configured on-call inbox', async () => {
    process.env.RESEND_API_KEY = 'test';
    process.env.ONCALL_PRIMARY_EMAIL = 'primary@example.com';
    send.mockResolvedValue({ data: null, error: { message: 'rejected' } });
    const result = await sendOperationalEmergencyAlert({ incidentType: 'cron_failure', severity: 'high', title: 'Controlled failure', summary: 'No business effects' });
    expect(result).toEqual({ dispatched: false, recipient: 'primary@example.com' });
  });
});
