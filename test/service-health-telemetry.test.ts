import { describe, it, expect, beforeEach } from 'vitest';
import { getApmSummary, getRoutePerformanceBreakdown } from '@/lib/apm-telemetry';
import { getRecentPagingEvents, getOnCallRoster } from '@/lib/on-call-paging';
import { runSyntheticUptimeProbe } from '@/lib/uptime-monitoring';

describe('Service Health Telemetry Truthfulness Gate (P1-1, P1-2, P1-3)', () => {
  describe('P1-1: APM Telemetry cold module', () => {
    it('returns active: false and 0 requests on cold startup', () => {
      const apm = getApmSummary();
      expect(apm.totalRequestsTracked).toBe(0);
      expect(apm.active).toBe(false);
      expect(apm.slowestRoutes).toEqual([]);
      expect(apm.highestErrorRoutes).toEqual([]);
    });

    it('returns empty route breakdown when unbuffered', () => {
      const routes = getRoutePerformanceBreakdown();
      expect(routes).toEqual([]);
    });
  });

  describe('P1-3: On-Call Paging cold buffer and fallback safety', () => {
    it('returns empty array for recent pages on startup (no fabricated baseline incident)', () => {
      const pages = getRecentPagingEvents();
      expect(pages).toEqual([]);
    });

    it('does not leak fake 555 numbers or fabricated ops@ email when env vars are unset', () => {
      const savedEmail = process.env.ONCALL_PRIMARY_EMAIL;
      const savedFounder = process.env.FOUNDER_ALERT_EMAIL;
      const savedPhone = process.env.ONCALL_PRIMARY_PHONE;
      const savedSecEmail = process.env.ONCALL_SECONDARY_EMAIL;
      const savedSecPhone = process.env.ONCALL_SECONDARY_PHONE;

      try {
        delete process.env.ONCALL_PRIMARY_EMAIL;
        delete process.env.FOUNDER_ALERT_EMAIL;
        delete process.env.ONCALL_PRIMARY_PHONE;
        delete process.env.ONCALL_SECONDARY_EMAIL;
        delete process.env.ONCALL_SECONDARY_PHONE;

        const roster = getOnCallRoster();
        expect(roster.primary.phone).toBe('Not configured');
        expect(roster.primary.email).toBe('Not configured');
        expect(roster.secondary.phone).toBe('Not configured');
        expect(roster.secondary.email).toBe('Not configured');
        expect(roster.primary.phone).not.toContain('555');
        expect(roster.secondary.phone).not.toContain('555');
      } finally {
        if (savedEmail) process.env.ONCALL_PRIMARY_EMAIL = savedEmail;
        if (savedFounder) process.env.FOUNDER_ALERT_EMAIL = savedFounder;
        if (savedPhone) process.env.ONCALL_PRIMARY_PHONE = savedPhone;
        if (savedSecEmail) process.env.ONCALL_SECONDARY_EMAIL = savedSecEmail;
        if (savedSecPhone) process.env.ONCALL_SECONDARY_PHONE = savedSecPhone;
      }
    });
  });

  describe('P1-2: Uptime Probe latency truthfulness', () => {
    it('never emits a non-null latencyMs for static configuration checks', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            limit: () => Promise.resolve({ data: [{ id: 'site_1' }], error: null }),
          }),
        }),
      } as any;

      const report = await runSyntheticUptimeProbe(mockSupabase);

      const staticSubsystems = [
        'quoting-engine',
        'stripe-payments',
        'sms-gateway',
        'voice-webhook',
        'email-resend',
        'contractor-cdn',
      ];

      for (const sub of report.subsystems) {
        if (staticSubsystems.includes(sub.id)) {
          expect(sub.latencyMs, `Subsystem ${sub.id} must have null latencyMs for static env check`).toBeNull();
        }
      }

      // Measured subsystems (database, cron-cadence) must have numeric latencies
      const dbProbe = report.subsystems.find((s) => s.id === 'database');
      expect(dbProbe).toBeDefined();
      expect(typeof dbProbe?.latencyMs).toBe('number');
    });
  });

  describe('P1-4: AI Operator trend history honesty', () => {
    it('returns available: false and empty history (no fabricated 7-day trend series)', async () => {
      const { executeOperatorTool } = await import('@/lib/ai-operator/tools');
      const mockSupabase = {} as any;
      const ctx = { supabase: mockSupabase, adminUserId: 'usr_1', source: 'admin_dashboard' } as any;

      const res = await executeOperatorTool('get_ops_trend_history', { days: 7 }, ctx);
      expect(res.data).toBeDefined();
      expect((res.data as any).available).toBe(false);
      expect((res.data as any).history).toEqual([]);
      expect((res.data as any).error).toContain('No historical metrics are recorded');
    });
  });
});
