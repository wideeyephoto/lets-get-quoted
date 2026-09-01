import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/health/route';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        limit: async () => ({ error: null, data: [{ id: 'site_123' }] }),
      }),
    }),
  }),
}));

describe('/api/health route', () => {
  it('returns valid health response with dynamic latency and live services', async () => {
    const req = new NextRequest('https://app.letsgetquoted.com/api/health');
    const res = await GET(req);
    expect(res).toBeDefined();
    expect([200, 503]).toContain(res.status);

    const data = await res.json();
    expect(data).toHaveProperty('status');
    expect(['operational', 'degraded', 'outage']).toContain(data.status);
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('latencyMs');
    expect(data.latencyMs).toBeGreaterThanOrEqual(1);

    expect(data).toHaveProperty('services');
    expect(Array.isArray(data.services)).toBe(true);
    expect(data.services.length).toBe(4);

    const serviceIds = data.services.map((s: { id: string }) => s.id);
    expect(serviceIds).toContain('quoting-engine');
    expect(serviceIds).toContain('sms-gateway');
    expect(serviceIds).toContain('stripe-payments');
    expect(serviceIds).toContain('contractor-cdn');

    for (const service of data.services) {
      expect(['operational', 'degraded', 'outage']).toContain(service.status);
      expect(typeof service.name).toBe('string');
      expect(typeof service.detail).toBe('string');
      expect(service.detail.length).toBeGreaterThan(0);
    }
  });
});
