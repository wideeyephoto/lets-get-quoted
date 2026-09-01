import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  recordRequestMetric,
  captureException,
  getApmSummary,
  getRoutePerformanceBreakdown,
  getRecentExceptions,
} from '@/lib/apm-telemetry';
import { runSyntheticUptimeProbe } from '@/lib/uptime-monitoring';
import {
  getOnCallRoster,
  dispatchOnCallPage,
  dispatchOnCallTestDrill,
  getRecentPagingEvents,
} from '@/lib/on-call-paging';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        limit: async () => ({ error: null, data: [{ id: 'site_123' }] }),
      }),
    }),
  }),
}));

vi.mock('@/lib/cron-runs', () => ({
  loadCronStatus: async () => ({
    last: new Map(),
    lastSuccessAt: new Map(),
    failedJobs: [],
  }),
}));

vi.mock('@/lib/founder-alerts', () => ({
  sendOperationalEmergencyAlert: async () => ({ dispatched: true, recipient: 'ops@letsgetquoted.com' }),
}));

describe('Reliability & Operations Center (APM, Uptime & Paging)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Application Performance Monitoring (APM)', () => {
    it('records request metrics and computes latency percentiles', () => {
      recordRequestMetric({
        path: '/api/leads',
        method: 'POST',
        statusCode: 200,
        durationMs: 45,
      });

      recordRequestMetric({
        path: '/api/leads',
        method: 'POST',
        statusCode: 500,
        durationMs: 420,
        error: 'Database timeout',
      });

      const summary = getApmSummary();
      expect(summary.active).toBe(true);
      expect(summary.totalRequestsTracked).toBeGreaterThanOrEqual(2);
      expect(summary.latencyPercentiles.p50Ms).toBeGreaterThan(0);
      expect(summary.latencyPercentiles.p95Ms).toBeGreaterThanOrEqual(summary.latencyPercentiles.p50Ms);
      expect(summary.latencyPercentiles.p99Ms).toBeGreaterThanOrEqual(summary.latencyPercentiles.p95Ms);
      expect(summary.statusCodeDistribution.status2xx).toBeGreaterThan(0);
    });

    it('captures exceptions and stores them in ring buffer', () => {
      const exc = captureException(new Error('Test runtime fault'), {
        path: '/api/stripe/webhook',
        severity: 'fatal',
        context: { eventId: 'evt_123' },
      });

      expect(exc.id).toBeDefined();
      expect(exc.message).toBe('Test runtime fault');
      expect(exc.path).toBe('/api/stripe/webhook');
      expect(exc.severity).toBe('fatal');

      const recent = getRecentExceptions();
      expect(recent.some((e) => e.message === 'Test runtime fault')).toBe(true);
    });

    it('breaks down route performance and highlights slow routes', () => {
      const routes = getRoutePerformanceBreakdown();
      expect(routes.length).toBeGreaterThan(0);
      for (const r of routes) {
        expect(r.path).toBeDefined();
        expect(r.totalRequests).toBeGreaterThan(0);
        expect(r.avgDurationMs).toBeGreaterThanOrEqual(0);
        expect(r.p95DurationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('2. Synthetic Uptime Monitoring', () => {
    it('evaluates all 8 critical platform subsystems', async () => {
      const report = await runSyntheticUptimeProbe();

      expect(['operational', 'degraded', 'outage']).toContain(report.overallStatus);
      expect(report.subsystems.length).toBe(8);

      const subsystemIds = report.subsystems.map((s) => s.id);
      expect(subsystemIds).toContain('database');
      expect(subsystemIds).toContain('quoting-engine');
      expect(subsystemIds).toContain('stripe-payments');
      expect(subsystemIds).toContain('sms-gateway');
      expect(subsystemIds).toContain('voice-webhook');
      expect(subsystemIds).toContain('email-resend');
      expect(subsystemIds).toContain('cron-cadence');
      expect(subsystemIds).toContain('contractor-cdn');

      for (const s of report.subsystems) {
        expect(['operational', 'degraded', 'outage']).toContain(s.status);
        expect(s.latencyMs).toBeGreaterThanOrEqual(1);
        expect(s.consequenceIfDown.length).toBeGreaterThan(10);
      }

      expect(report.sla.uptime30dPct).toBeGreaterThanOrEqual(99.0);
      expect(report.externalMonitoring.pingEndpoint).toBe('/api/health');
    });
  });

  describe('3. Automated On-Call Paging & Emergency Escalation', () => {
    it('returns active on-call roster and configured paging channels', () => {
      const roster = getOnCallRoster();

      expect(roster.primary).toBeDefined();
      expect(roster.primary.email).toBeDefined();
      expect(roster.secondary).toBeDefined();
      expect(roster.escalationTimeoutMinutes).toBe(15);

      expect(roster.channels.length).toBeGreaterThanOrEqual(5);
      const channelIds = roster.channels.map((c) => c.id);
      expect(channelIds).toContain('emergency_sms_email');
      expect(channelIds).toContain('pagerduty');
      expect(channelIds).toContain('opsgenie');
      expect(channelIds).toContain('slack_ops');
      expect(channelIds).toContain('discord_ops');
    });

    it('dispatches on-call emergency page across channels', async () => {
      const page = await dispatchOnCallPage({
        title: 'Money Cron Settlement Stalled',
        severity: 'P1_CRITICAL',
        summary: 'Overage settlement cron has not completed in past 90 minutes.',
        incidentType: 'cron_failure',
        source: 'cron:overage-settlement',
        details: { delayedMinutes: 90 },
      });

      expect(page.id).toBeDefined();
      expect(page.severity).toBe('P1_CRITICAL');
      expect(page.dispatchedChannels.length).toBeGreaterThan(0);

      const recent = getRecentPagingEvents();
      expect(recent.some((p) => p.id === page.id)).toBe(true);
    });

    it('dispatches manual on-call test drill initiated by staff', async () => {
      const drill = await dispatchOnCallTestDrill('staff@letsgetquoted.com');

      expect(drill.id).toBeDefined();
      expect(drill.title).toContain('Drill');
      expect(drill.severity).toBe('P3_WARNING');
      expect(drill.dispatchedChannels.length).toBeGreaterThan(0);
    });
  });
});
