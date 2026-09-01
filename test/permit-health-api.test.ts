import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/permits/health/route';

describe('Permit System Health & Diagnostics API - GET /api/permits/health', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test_cron_secret_123';
  });

  it('returns sanitized status for public unauthenticated requests', async () => {
    const res = await GET(new NextRequest('http://localhost:3010/api/permits/health'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe('healthy');
    expect(data.version).toBe('1.0.0');
    expect(data.timestamp).toBeDefined();
    // Public callers should not receive internal component details
    expect(data.components).toBeUndefined();
  });

  it('returns full subsystem diagnostics for authenticated diagnostic callers', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3010/api/permits/health', {
        headers: {
          authorization: 'Bearer test_cron_secret_123',
        },
      })
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe('healthy');
    expect(data.version).toBe('1.0.0');
    expect(data.timestamp).toBeDefined();
    expect(data.components).toBeDefined();

    // Check location context
    expect(data.components.locationContext.status).toBe('healthy');
    expect(data.components.locationContext.sampleAuthority).toBe('City of Royal Oak');

    // Check multi-discipline code adoptions
    expect(data.components.codeCatalog.status).toBe('healthy');
    expect(data.components.codeCatalog.adoptions.building).toContain('Residential');
    expect(data.components.codeCatalog.adoptions.electrical).toContain('Electrical');
    expect(data.components.codeCatalog.adoptions.mechanical).toContain('Mechanical');
    expect(data.components.codeCatalog.adoptions.plumbing).toContain('Plumbing');

    // Check submission pipeline & providers
    expect(data.components.submissionPipeline.consentGateEnforced).toBe(true);
    expect(data.components.providerAdapters.bsaAccessMyGov).toBe('mock_pilot');
    expect(data.components.providerAdapters.accelaCitizenAccess).toBe('in_development');
    expect(data.components.webhookRouters.status).toBeDefined();
  });
});
