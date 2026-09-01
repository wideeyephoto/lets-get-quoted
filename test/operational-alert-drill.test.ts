import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendOperationalEmergencyAlert } from '../src/lib/founder-alerts';
// @ts-expect-error JS script module without declarations
import { MANUFACTURED_ALERT_CATEGORIES, runOperationalAlertDrill } from '../scripts/drill-operational-alerts.mjs';

describe('Operational Emergency Alert Drill', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('verifies all 7 operational alert categories are defined with valid severity and metadata', () => {
    expect(MANUFACTURED_ALERT_CATEGORIES.length).toBe(7);

    const expectedCategories = [
      'uptime',
      'runtime_exception',
      'cron_failure',
      'webhook_dead_letter',
      'billing_reconciliation',
      'sms_queue_stall',
      'provider_outage',
    ];

    const definedCategories = MANUFACTURED_ALERT_CATEGORIES.map((a: { incidentType: string }) => a.incidentType);
    expect(definedCategories).toEqual(expectedCategories);

    for (const alert of MANUFACTURED_ALERT_CATEGORIES) {
      expect(['critical', 'high', 'warning']).toContain(alert.severity);
      expect(alert.title).toBeDefined();
      expect(alert.summary).toBeDefined();
      expect(alert.actionRequired).toBeDefined();
    }
  });

  it('runs drill harness in dry-run mode and verifies payload generation', async () => {
    const results = await runOperationalAlertDrill({ dryRun: true });
    expect(results.length).toBe(7);
    for (const r of results) {
      expect(r.dryRun).toBe(true);
    }
  });

  it('safely logs to console and returns failure when RESEND_API_KEY is missing without throwing', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const res = await sendOperationalEmergencyAlert({
      incidentType: 'uptime',
      severity: 'critical',
      title: 'Test Uptime Alert',
      summary: 'Test summary',
    });

    expect(res.dispatched).toBe(false);
    expect(res.recipient).toBeDefined();
  });
});
