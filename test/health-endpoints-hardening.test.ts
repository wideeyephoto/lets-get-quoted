import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getHealth } from '@/app/api/health/route';
import { GET as getPermitsHealth } from '@/app/api/permits/health/route';
import fs from 'fs';
import path from 'path';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        limit: async () => ({ error: null, data: [{ id: 'site_123' }] }),
      }),
    }),
    rpc: async () => ({ data: true, error: null }),
  }),
}));

vi.mock('@/lib/apm-telemetry', () => ({
  recordRequestMetric: vi.fn(),
  getApmSummary: () => ({
    latencyPercentiles: { p50Ms: 15, p95Ms: 42, p99Ms: 85 },
    errorRatePct: 0.0,
    active: true,
  }),
}));

describe('Pre-Launch Diagnostic Health Endpoints Hardening', () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const originalPermitSecret = process.env.PERMIT_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test_cron_secret_12345';
    process.env.PERMIT_WEBHOOK_SECRET = 'test_permit_secret_67890';
  });

  describe('/api/health Route Sanitization & Authorization', () => {
    it('returns sanitized, safe operational response to unauthenticated callers', async () => {
      const req = new NextRequest('https://app.letsgetquoted.com/api/health');
      const res = await getHealth(req);

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('status');
      expect(['operational', 'degraded', 'outage']).toContain(data.status);
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('services');

      // Check that unauthenticated details do not leak internal credential warning text
      for (const service of data.services) {
        expect(service.detail).not.toMatch(/unconfigured/i);
        expect(service.detail).not.toMatch(/credentials unconfigured/i);
        expect(service.detail).not.toMatch(/\(\d+ms\)/); // ms latency hidden from public service details
      }

      // Check that detailed APM percentiles are omitted for unauthenticated callers
      expect(data.apm?.p95Ms).toBeUndefined();
      expect(data.apm?.errorRatePct).toBeUndefined();
      expect(res.headers.get('X-LGQ-APM-P95')).toBeNull();
    });

    it('returns full diagnostic details and APM percentiles to authorized cron/admin callers', async () => {
      const req = new NextRequest('https://app.letsgetquoted.com/api/health', {
        headers: {
          authorization: 'Bearer test_cron_secret_12345',
        },
      });
      const res = await getHealth(req);

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.apm?.p95Ms).toBe(42);
      expect(data.apm?.errorRatePct).toBe(0.0);
      expect(res.headers.get('X-LGQ-APM-P95')).toBe('42ms');
    });

    it('authorizes diagnostic access via ?secret= query parameter', async () => {
      const req = new NextRequest('https://app.letsgetquoted.com/api/health?secret=test_cron_secret_12345');
      const res = await getHealth(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.apm?.p95Ms).toBe(42);
    });
  });

  describe('/api/permits/health Route Sanitization & Authorization', () => {
    it('returns sanitized status without leaking provider adapters or vault state to unauthenticated callers', async () => {
      const req = new NextRequest('https://app.letsgetquoted.com/api/permits/health');
      const res = await getPermitsHealth(req);

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('version', '1.0.0');
      expect(data).toHaveProperty('timestamp');

      // Unauthenticated callers must NOT receive internal provider/component diagnostics
      expect(data.components).toBeUndefined();
    });

    it('returns full component diagnostics to authorized callers with CRON_SECRET or PERMIT_WEBHOOK_SECRET', async () => {
      const req = new NextRequest('https://app.letsgetquoted.com/api/permits/health', {
        headers: {
          authorization: 'Bearer test_permit_secret_67890',
        },
      });
      const res = await getPermitsHealth(req);

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.components).toBeDefined();
      expect(data.components.locationContext).toBeDefined();
      expect(data.components.codeCatalog).toBeDefined();
      expect(data.components.providerAdapters).toBeDefined();
      expect(data.components.webhookRouters).toBeDefined();
      expect(data.components.credentialsVault).toBeDefined();
    });
  });

  describe('Privacy Policy Subprocessor & Zero-Retention Invariants', () => {
    it('contains explicit Google Gemini API zero-retention & non-training commitments', () => {
      const privacyFilePath = path.join(process.cwd(), 'src/app/privacy/page.tsx');
      const content = fs.readFileSync(privacyFilePath, 'utf8').replace(/\s+/g, ' ');

      expect(content).toContain('Google Gemini API');
      expect(content).toContain('zero-data-retention');
      expect(content).toContain('never used to train public foundation models');
      expect(content).toContain('SignalWire, Inc.');
      expect(content).toContain('30-day soft deletion grace period');
      expect(content).toContain('Row Level Security');
    });
  });
});
