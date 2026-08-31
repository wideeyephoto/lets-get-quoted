import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/rate-limit', () => ({
  clientIpFrom: vi.fn().mockReturnValue('127.0.0.1'),
  checkRateLimit: vi.fn().mockResolvedValue(true),
  checkRateLimitStrict: vi.fn().mockResolvedValue(true),
}));

import { GET } from '../src/app/api/permits/public-estimate/route';
import { checkRateLimitStrict } from '@/lib/rate-limit';

describe('Public Permit Estimate API - GET /api/permits/public-estimate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects request with 400 when address parameter is missing', async () => {
    const req = new NextRequest('http://localhost/api/permits/public-estimate');
    const res = await GET(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toContain('Missing address');
  });

  it('returns rate limit error 429 when checkRateLimit fails', async () => {
    vi.mocked(checkRateLimitStrict).mockResolvedValueOnce(false);

    const req = new NextRequest('http://localhost/api/permits/public-estimate?address=Royal+Oak+MI');
    const res = await GET(req);
    expect(res.status).toBe(429);

    const json = await res.json();
    expect(json.error).toContain('Too many');
  });

  it('evaluates permit requirement and fee for Royal Oak roofing project', async () => {
    const req = new NextRequest('http://localhost/api/permits/public-estimate?address=211+S+Williams+St,+Royal+Oak,+MI&trade=roofing&cost=12000');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.jurisdiction.authorityId).toBe('mi-royal-oak');
    expect(json.jurisdiction.authorityName).toBe('City of Royal Oak');
    expect(json.requirement.decision).toBe('required');
    expect(json.requirement.estimatedGovernmentFee.estimatedTotal).toBeGreaterThan(0);
    expect(json.requirement.citations.length).toBeGreaterThan(0);
    expect(json.requirement.citations[0].codeFamily).toBe('MRC');
  });

  it('evaluates electrical permit for Detroit address', async () => {
    const req = new NextRequest('http://localhost/api/permits/public-estimate?address=100+Michigan+Ave,+Detroit,+MI&trade=electrical&cost=4500');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.jurisdiction.authorityId).toBe('mi-detroit');
    expect(json.requirement.decision).toBe('required');
    expect(json.requirement.estimatedGovernmentFee.estimatedTotal).toBeGreaterThan(0);
  });
});
