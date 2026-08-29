import { describe, it, expect } from 'vitest';
import { GET } from '../src/app/api/permits/health/route';

describe('Permit System Health & Diagnostics API - GET /api/permits/health', () => {
  it('returns healthy status with all subsystems, code catalogs, and providers reporting ready', async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe('healthy');
    expect(data.version).toBe('1.0.0');
    expect(data.timestamp).toBeDefined();

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
